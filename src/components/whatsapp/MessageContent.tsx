import { useState, useRef, useMemo, useEffect } from 'react';
import { Image, Video, Mic, FileText, Play, Download, Loader2, CheckCircle2, AlertCircle, ExternalLink, User, Copy, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MediaData {
  // Support both uppercase (UAZAPI) and lowercase keys
  URL?: string;
  url?: string;
  DirectPath?: string;
  directPath?: string;
  JPEGThumbnail?: string;
  jpegThumbnail?: string;
  Seconds?: number;
  seconds?: number;
  Mimetype?: string;
  mimetype?: string;
  Caption?: string;
  caption?: string;
  FileName?: string;
  fileName?: string;
  FileLength?: number;
  fileLength?: number;
  FileSize?: number;
  fileSize?: number;
  MediaKey?: string;
  mediaKey?: string;
  media_url?: string;
  FileEncSha256?: string;
  fileEncSha256?: string;
  // Transcription for audio files
  transcription?: string;
  transcribed_at?: string;
  // Contact card fields
  displayName?: string;
  vcard?: string;
  // Text message in JSON format (from WhatsApp API)
  text?: string;
  key?: unknown;
  contextInfo?: unknown;
}

interface MessageContentProps {
  content: string | null;
  messageType: string;
  mediaUrl?: string | null;
  direction: 'incoming' | 'outgoing';
  messageId?: string;
  onAddLead?: (phone: string, name?: string) => void;
}

// Parse JSON content safely
function parseMediaContent(content: string | null): MediaData | null {
  if (!content) return null;
  
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Normalize media data to handle both upper and lowercase keys
function normalizeMediaData(data: MediaData | null): {
  url: string | null;
  directPath: string | null;
  thumbnail: string | null;
  seconds: number | null;
  mimetype: string | null;
  caption: string | null;
  fileName: string | null;
  fileLength: number | null;
  mediaKey: string | null;
  mediaUrl: string | null;
  transcription: string | null;
} {
  if (!data) {
    return { url: null, directPath: null, thumbnail: null, seconds: null, mimetype: null, caption: null, fileName: null, fileLength: null, mediaKey: null, mediaUrl: null, transcription: null };
  }
  
  return {
    url: data.URL || data.url || null,
    directPath: data.DirectPath || data.directPath || null,
    thumbnail: data.JPEGThumbnail || data.jpegThumbnail || null,
    seconds: data.Seconds ?? data.seconds ?? null,
    mimetype: data.Mimetype || data.mimetype || null,
    caption: data.Caption || data.caption || null,
    fileName: data.FileName || data.fileName || null,
    fileLength: data.FileLength || data.fileLength || data.FileSize || data.fileSize || null,
    mediaKey: data.MediaKey || data.mediaKey || null,
    mediaUrl: data.media_url || null,
    transcription: data.transcription || null,
  };
}

// Format audio duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Extract text content from JSON message format
function extractTextFromJson(data: MediaData | null): string | null {
  if (!data) return null;
  
  // If has 'text' field, it's a text message in JSON format
  if (typeof data.text === 'string' && data.text.trim()) {
    return data.text;
  }
  
  return null;
}

// Infer media type from data
function inferMediaType(normalized: ReturnType<typeof normalizeMediaData>, rawData?: MediaData | null): string | null {
  // Detect contact card
  if (rawData?.displayName && rawData?.vcard) {
    return 'contacts';
  }
  
  const mime = (normalized.mimetype || '').toLowerCase();
  
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/') || mime.includes('ogg') || mime.includes('opus')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('application/') || mime.includes('pdf') || mime.includes('document')) return 'document';
  
  // Fallback heuristics
  if (normalized.thumbnail && !normalized.seconds) return 'image';
  if (normalized.seconds !== null) return 'audio';
  if (normalized.fileName || normalized.fileLength) return 'document';
  if (normalized.mediaKey || normalized.directPath) return 'image'; // Default encrypted media to image
  
  return null;
}

// Audio Player component with error handling and fallbacks
interface AudioPlayerProps {
  audioUrl: string | null;
  duration: number | null;
  mimetype: string | null;
  isOutgoing: boolean;
  hasEncryptedMedia: boolean;
  onDownload: () => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: 'idle' | 'downloading' | 'processing' | 'success' | 'error';
  transcription?: string | null;
  messageId?: string;
}

function AudioPlayer({ 
  audioUrl, 
  duration, 
  mimetype, 
  isOutgoing, 
  hasEncryptedMedia, 
  onDownload,
  isDownloading,
  downloadProgress,
  downloadStatus,
  transcription,
  messageId
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioError, setAudioError] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [localTranscription, setLocalTranscription] = useState<string | null>(transcription || null);

  // Detectar se o navegador suporta OGG Opus
  const canPlayOgg = useMemo(() => {
    if (typeof document === 'undefined') return true;
    const audio = document.createElement('audio');
    return audio.canPlayType('audio/ogg; codecs=opus') !== '';
  }, []);
  
  // Detectar navegador Safari
  const isSafari = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  }, []);

  // Verificar se é formato OGG
  const isOggFormat = useMemo(() => {
    return mimetype?.includes('ogg') || mimetype?.includes('opus') || audioUrl?.includes('.ogg');
  }, [mimetype, audioUrl]);

  // Se é OGG e navegador não suporta, já marcar erro proativamente
  useEffect(() => {
    if (isOggFormat && !canPlayOgg) {
      console.log('[Audio] Browser does not support OGG Opus format, showing fallback');
      setAudioError(true);
    }
  }, [isOggFormat, canPlayOgg]);

  // Atualizar transcrição local quando prop mudar
  useEffect(() => {
    if (transcription) {
      setLocalTranscription(transcription);
    }
  }, [transcription]);

  const handleAudioError = () => {
    console.log('[Audio] Playback error for:', audioUrl?.substring(0, 50), 'mimetype:', mimetype);
    setAudioError(true);
  };

  const handleAudioCanPlay = () => {
    setAudioLoaded(true);
    setAudioError(false);
  };

  // Função para transcrever o áudio
  const handleTranscribe = async () => {
    if (!audioUrl || !messageId) return;
    
    setIsTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('convert-audio-to-mp3', {
        body: {
          source_url: audioUrl,
          message_id: messageId,
          transcribe: true
        }
      });

      if (error) throw error;

      if (data?.transcription) {
        setLocalTranscription(data.transcription);
        toast.success('Áudio transcrito com sucesso!');
      } else {
        toast.info('Transcrição não disponível para este áudio');
      }
    } catch (err) {
      console.error('[Audio] Transcription error:', err);
      toast.error('Erro ao transcrever áudio');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Download button for audio (inline version)
  const AudioDownloadButton = () => {
    if (downloadStatus === 'success') {
      return (
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
          isOutgoing ? "bg-primary-foreground/20 text-primary-foreground" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        )}>
          <CheckCircle2 className="h-4 w-4" />
          <span>Pronto!</span>
        </div>
      );
    }

    if (isDownloading) {
      return (
        <div className={cn(
          "flex flex-col gap-2 min-w-[140px]",
          isOutgoing ? "text-primary-foreground" : ""
        )}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">
              {downloadStatus === 'processing' ? 'Processando...' : 'Baixando...'}
            </span>
          </div>
          <Progress 
            value={downloadProgress} 
            className={cn(
              "h-1.5",
              isOutgoing ? "[&>div]:bg-primary-foreground/80" : ""
            )}
          />
        </div>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onDownload}
        disabled={isDownloading}
        className={cn(
          "gap-2 transition-all",
          isOutgoing 
            ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20" 
            : "hover:bg-primary/10"
        )}
      >
        <Download className="h-4 w-4" />
        Baixar áudio
      </Button>
    );
  };

  // Componente de transcrição
  const TranscriptionDisplay = () => {
    if (localTranscription) {
      return (
        <div className={cn(
          "mt-2 p-2 rounded-lg border",
          isOutgoing 
            ? "bg-primary-foreground/5 border-primary-foreground/20" 
            : "bg-muted/30 border-muted"
        )}>
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-3 w-3 opacity-60" />
            <span className={cn(
              "text-xs font-medium opacity-60",
              isOutgoing ? "text-primary-foreground" : ""
            )}>
              Transcrição:
            </span>
          </div>
          <p className={cn(
            "text-sm",
            isOutgoing ? "text-primary-foreground/90" : "text-foreground/90"
          )}>
            {localTranscription}
          </p>
        </div>
      );
    }

    // Botão para transcrever (apenas se tiver URL e messageId)
    if (audioUrl && messageId && audioError) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTranscribe}
          disabled={isTranscribing}
          className={cn(
            "mt-2 gap-1.5 text-xs",
            isOutgoing 
              ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {isTranscribing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Transcrevendo...
            </>
          ) : (
            <>
              <FileText className="h-3 w-3" />
              Transcrever áudio
            </>
          )}
        </Button>
      );
    }

    return null;
  };

  // Componente de fallback informativo para formato não suportado
  const UnsupportedFormatFallback = () => (
    <div className={cn(
      "flex flex-col gap-2 p-3 rounded-lg",
      isOutgoing ? "bg-primary-foreground/10" : "bg-muted/50"
    )}>
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm font-medium">
          {isSafari 
            ? "Safari não reproduz este formato" 
            : "Formato não suportado pelo navegador"}
        </span>
      </div>
      
      {/* Mostrar duração se disponível */}
      {duration !== null && (
        <span className={cn("text-xs", isOutgoing ? "text-primary-foreground/60" : "text-muted-foreground")}>
          Duração: {formatDuration(duration)}
        </span>
      )}
      
      {/* Dica para Safari */}
      {isSafari && !localTranscription && (
        <span className={cn("text-xs italic", isOutgoing ? "text-primary-foreground/60" : "text-muted-foreground")}>
          💡 Dica: Abra em Chrome ou Firefox para reproduzir
        </span>
      )}
      
      {audioUrl && (
        <div className="flex flex-wrap gap-2 mt-1">
          <a 
            href={audioUrl}
            download={`audio_${Date.now()}.ogg`}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
              isOutgoing 
                ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30" 
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar áudio
          </a>
          <a 
            href={audioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
              isOutgoing 
                ? "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20" 
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir em nova aba
          </a>
        </div>
      )}

      {/* Mostrar transcrição ou botão de transcrever */}
      <TranscriptionDisplay />
    </div>
  );

  // If we have a URL, try to play it
  if (audioUrl) {
    return (
      <div className="space-y-2 min-w-[180px]">
        {!audioError ? (
          <audio 
            ref={audioRef}
            src={audioUrl}
            controls 
            className="h-10 max-w-full w-full"
            onError={handleAudioError}
            onCanPlay={handleAudioCanPlay}
          />
        ) : (
          <UnsupportedFormatFallback />
        )}
      </div>
    );
  }
  
  // No URL - show placeholder with download option
  return (
    <div className="space-y-2">
      <div className={cn(
        "flex items-center gap-2 py-1 min-w-[120px]",
        isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        <div className={cn(
          "p-2 rounded-full",
          isOutgoing ? "bg-primary-foreground/20" : "bg-muted"
        )}>
          <Mic className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Áudio</span>
          {duration !== null && (
            <span className="text-xs opacity-70">{formatDuration(duration)}</span>
          )}
        </div>
      </div>
      {hasEncryptedMedia && <AudioDownloadButton />}
    </div>
  );
}

export function MessageContent({ content, messageType, mediaUrl, direction, messageId, onAddLead }: MessageContentProps) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'processing' | 'success' | 'error'>('idle');
  const [downloadedUrl, setDownloadedUrl] = useState<string | null>(null);

  const isOutgoing = direction === 'outgoing';
  const mediaData = parseMediaContent(content);
  const normalized = normalizeMediaData(mediaData);

  // Known media types that should be trusted from the database
  const KNOWN_MEDIA_TYPES = ['image', 'video', 'audio', 'ptt', 'document', 'sticker', 'contacts'];
  
  // Infer media type when backend stored message_type as "text" but content is JSON metadata
  const inferredType = inferMediaType(normalized, mediaData);
  
  // Priority: 1) Known messageType from DB, 2) inferredType from content, 3) fallback to messageType
  const effectiveType = KNOWN_MEDIA_TYPES.includes(messageType) 
    ? messageType 
    : (inferredType || messageType);

  // Check if we have encrypted media that needs downloading
  const hasEncryptedMedia = !!(normalized.mediaKey && (normalized.url || normalized.directPath));
  const hasPlayableUrl = !!(mediaUrl || downloadedUrl || normalized.mediaUrl);
  
  console.log('[MessageContent]', { messageType, effectiveType, inferredType, hasMediaData: !!mediaData, hasEncryptedMedia, hasThumbnail: !!normalized.thumbnail });

  // Download encrypted media
  const handleDownloadMedia = async () => {
    if (!normalized.mediaKey || (!normalized.url && !normalized.directPath)) {
      toast.error('Dados de mídia incompletos');
      return;
    }

    setIsDownloading(true);
    setDownloadStatus('downloading');
    setDownloadProgress(0);

    // Simulate progress animation
    const progressInterval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      setDownloadStatus('downloading');
      
      const { data, error } = await supabase.functions.invoke('whatsapp-download-media', {
        body: {
          message_id: messageId,
          encrypted_url: normalized.url || `https://mmg.whatsapp.net${normalized.directPath}`,
          media_key: normalized.mediaKey,
          media_type: effectiveType,
          mimetype: normalized.mimetype,
        }
      });

      clearInterval(progressInterval);

      if (error) {
        console.error('Download error:', error);
        setDownloadStatus('error');
        setDownloadProgress(0);
        toast.error('Erro ao baixar mídia');
        return;
      }

      if (data?.media_url) {
        setDownloadProgress(100);
        setDownloadStatus('success');
        setDownloadedUrl(data.media_url);
        toast.success('Mídia baixada!');
        
        // Reset status after animation
        setTimeout(() => {
          setDownloadStatus('idle');
        }, 1500);
      } else {
        setDownloadStatus('error');
        setDownloadProgress(0);
        toast.error('Falha ao baixar mídia');
      }
    } catch (err) {
      console.error('Download exception:', err);
      clearInterval(progressInterval);
      setDownloadStatus('error');
      setDownloadProgress(0);
      toast.error('Erro ao baixar mídia');
    } finally {
      setIsDownloading(false);
    }
  };

  // Get the best available image URL
  const getImageSource = (): string | null => {
    if (downloadedUrl) return downloadedUrl;
    if (mediaUrl) return mediaUrl;
    if (normalized.mediaUrl) return normalized.mediaUrl;
    if (normalized.thumbnail) return `data:image/jpeg;base64,${normalized.thumbnail}`;
    if (normalized.url && !hasEncryptedMedia) return normalized.url;
    return null;
  };

  // Download button component with visual progress
  const DownloadButton = () => {
    if (downloadStatus === 'success') {
      return (
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
          isOutgoing ? "bg-primary-foreground/20 text-primary-foreground" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        )}>
          <CheckCircle2 className="h-4 w-4" />
          <span>Pronto!</span>
        </div>
      );
    }

    if (isDownloading) {
      return (
        <div className={cn(
          "flex flex-col gap-2 min-w-[140px]",
          isOutgoing ? "text-primary-foreground" : ""
        )}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">
              {downloadStatus === 'processing' ? 'Processando...' : 'Baixando...'}
            </span>
          </div>
          <Progress 
            value={downloadProgress} 
            className={cn(
              "h-1.5",
              isOutgoing ? "[&>div]:bg-primary-foreground/80" : ""
            )}
          />
        </div>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadMedia}
        disabled={isDownloading}
        className={cn(
          "gap-2 transition-all",
          isOutgoing 
            ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20" 
            : "hover:bg-primary/10"
        )}
      >
        <Download className="h-4 w-4" />
        Baixar mídia
      </Button>
    );
  };

  // Handle image type
  if (effectiveType === 'image') {
    const imageSrc = getImageSource();

    if (imageSrc) {
      const isOnlyThumbnail = imageSrc.startsWith('data:') && hasEncryptedMedia && !hasPlayableUrl;
      
      return (
        <>
          <div className="space-y-2">
            <div 
              className="cursor-pointer"
              onClick={() => {
                if (!isOnlyThumbnail) {
                  setFullImageUrl(downloadedUrl || mediaUrl || normalized.mediaUrl || normalized.url || imageSrc);
                  setImageModalOpen(true);
                }
              }}
            >
              <img 
                src={imageSrc}
                alt="Imagem"
                className={cn(
                  "max-w-full rounded-lg max-h-64 object-cover",
                  isOnlyThumbnail && "opacity-70"
                )}
                loading="lazy"
              />
              {normalized.caption && (
                <p className="text-sm mt-2 whitespace-pre-wrap break-words">{normalized.caption}</p>
              )}
            </div>
            {isOnlyThumbnail && <DownloadButton />}
          </div>
          
          <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
            <DialogContent className="max-w-4xl p-0 border-0 bg-transparent">
              <DialogTitle className="sr-only">Imagem ampliada</DialogTitle>
              <DialogDescription className="sr-only">Visualização em tela cheia da imagem</DialogDescription>
              <img 
                src={fullImageUrl}
                alt="Imagem ampliada"
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    
    // Fallback: show icon placeholder with download option
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-2 py-1",
          isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          <Image className="h-4 w-4" />
          <span className="text-sm">Imagem</span>
        </div>
        {hasEncryptedMedia && <DownloadButton />}
      </div>
    );
  }
  
  // Handle audio type
  if (effectiveType === 'audio' || effectiveType === 'ptt') {
    return (
      <AudioPlayer 
        audioUrl={downloadedUrl || mediaUrl || normalized.mediaUrl || (!hasEncryptedMedia ? normalized.url : null)}
        duration={normalized.seconds}
        mimetype={normalized.mimetype}
        isOutgoing={isOutgoing}
        hasEncryptedMedia={hasEncryptedMedia}
        onDownload={handleDownloadMedia}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        downloadStatus={downloadStatus}
        transcription={normalized.transcription}
        messageId={messageId}
      />
    );
  }
  
  // Handle video type
  if (effectiveType === 'video') {
    const videoUrl = downloadedUrl || mediaUrl || normalized.mediaUrl || (!hasEncryptedMedia ? normalized.url : null);
    
    if (videoUrl) {
      return (
        <div>
          <video 
            src={videoUrl}
            controls
            className="max-w-full rounded-lg max-h-64"
            poster={normalized.thumbnail ? `data:image/jpeg;base64,${normalized.thumbnail}` : undefined}
          />
          {normalized.caption && (
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{normalized.caption}</p>
          )}
        </div>
      );
    }
    
    // Fallback with thumbnail
    if (normalized.thumbnail) {
      return (
        <div className="space-y-2">
          <div className="relative">
            <img 
              src={`data:image/jpeg;base64,${normalized.thumbnail}`}
              alt="Vídeo"
              className="max-w-full rounded-lg max-h-64 object-cover opacity-70"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/50 rounded-full p-3">
                <Play className="h-6 w-6 text-white fill-white" />
              </div>
            </div>
            {normalized.seconds !== null && (
              <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                {formatDuration(normalized.seconds)}
              </span>
            )}
          </div>
          {normalized.caption && (
            <p className="text-sm whitespace-pre-wrap break-words">{normalized.caption}</p>
          )}
          {hasEncryptedMedia && <DownloadButton />}
        </div>
      );
    }
    
    // Fallback: icon only
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-2 py-1",
          isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          <Video className="h-4 w-4" />
          <span className="text-sm">Vídeo</span>
          {normalized.seconds !== null && <span className="text-xs opacity-70">({formatDuration(normalized.seconds)})</span>}
        </div>
        {hasEncryptedMedia && <DownloadButton />}
      </div>
    );
  }
  
  // Handle document type
  if (effectiveType === 'document') {
    const docUrl = downloadedUrl || mediaUrl || normalized.mediaUrl || (!hasEncryptedMedia ? normalized.url : null);
    
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-3 p-2 rounded-lg min-w-[200px]",
          isOutgoing ? "bg-primary-foreground/10" : "bg-muted/50"
        )}>
          <div className={cn(
            "p-2 rounded",
            isOutgoing ? "bg-primary-foreground/20" : "bg-muted"
          )}>
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{normalized.fileName || 'Documento'}</p>
            {normalized.fileLength && (
              <p className="text-xs opacity-70">{formatFileSize(normalized.fileLength)}</p>
            )}
          </div>
          {docUrl && (
            <a 
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "p-1.5 rounded hover:bg-black/10",
                isOutgoing ? "text-primary-foreground" : "text-foreground"
              )}
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
        {hasEncryptedMedia && !docUrl && <DownloadButton />}
      </div>
    );
  }
  
  // Handle sticker type
  if (effectiveType === 'sticker') {
    const stickerUrl = downloadedUrl || mediaUrl || normalized.mediaUrl || (!hasEncryptedMedia ? normalized.url : null);
    
    if (stickerUrl) {
      return (
        <img 
          src={stickerUrl}
          alt="Figurinha"
          className="max-w-[150px] max-h-[150px]"
        />
      );
    }
    
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-2 py-1",
          isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          <span className="text-2xl">🏷️</span>
          <span className="text-sm">Figurinha</span>
        </div>
        {hasEncryptedMedia && <DownloadButton />}
      </div>
    );
  }

  // Handle contacts type (vCard)
  if (effectiveType === 'contacts' && mediaData) {
    const displayName = mediaData.displayName || 'Contato';
    const vcard = mediaData.vcard || '';
    
    // Extract phone from vCard
    const phoneMatch = vcard.match(/TEL[^:]*:([+\d\s-]+)/);
    const phone = phoneMatch ? phoneMatch[1].trim() : null;
    
    // Extract business description
    const descMatch = vcard.match(/X-WA-BIZ-DESCRIPTION:(.+)/);
    const description = descMatch ? descMatch[1].trim() : null;

    const handleCopyPhone = () => {
      if (phone) {
        navigator.clipboard.writeText(phone.replace(/\s/g, ''));
        toast.success('Número copiado!');
      }
    };

    const handleAddToCRM = () => {
      if (phone && onAddLead) {
        onAddLead(phone.replace(/\s/g, ''), displayName !== 'Contato' ? displayName : undefined);
      }
    };
    
    return (
      <div className={cn(
        "p-3 rounded-lg space-y-2 min-w-[200px]",
        isOutgoing ? "bg-primary-foreground/10" : "bg-muted/50"
      )}>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={cn(
              isOutgoing ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted"
            )}>
              {displayName[0]?.toUpperCase() || <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-medium truncate",
              isOutgoing ? "text-primary-foreground" : ""
            )}>
              {displayName}
            </p>
            {phone && (
              <p className={cn(
                "text-sm truncate",
                isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {phone}
              </p>
            )}
          </div>
        </div>
        {description && (
          <p className={cn(
            "text-xs line-clamp-2",
            isOutgoing ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {description}
          </p>
        )}
        {phone && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPhone}
              className={cn(
                "gap-1.5 flex-1",
                isOutgoing 
                  ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20" 
                  : "hover:bg-primary/10"
              )}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
            {onAddLead && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddToCRM}
                className={cn(
                  "gap-1.5 flex-1",
                  isOutgoing 
                    ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20" 
                    : "hover:bg-primary/10"
                )}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
  
  // Default: text message or unrecognized JSON
  if (mediaData && hasEncryptedMedia) {
    // It's encrypted media we couldn't handle - show download option
    return (
      <div className="space-y-2">
        <div className={cn(
          "flex items-center gap-2 py-1",
          isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          <FileText className="h-4 w-4" />
          <span className="text-sm">Mídia</span>
        </div>
        <DownloadButton />
      </div>
    );
  }
  
  // Check if it's a text message in JSON format (e.g., {"text": "message"})
  const jsonTextContent = extractTextFromJson(mediaData);
  if (mediaData && jsonTextContent) {
    // It's a text message wrapped in JSON - render normally
    return (
      <p className="text-sm whitespace-pre-wrap break-words">{jsonTextContent}</p>
    );
  }
  
  if (mediaData) {
    // It's JSON but unrecognized type - show placeholder
    return (
      <div className={cn(
        "flex items-center gap-2 py-1",
        isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        <FileText className="h-4 w-4" />
        <span className="text-sm">Mídia não suportada</span>
      </div>
    );
  }
  
  // Regular text
  return (
    <p className="text-sm whitespace-pre-wrap break-words">{content || ''}</p>
  );
}

// Helper for preview in conversation list
export function formatMessagePreview(content: string | null, messageType: string): string {
  if (!content) return '';

  const trimmed = content.trim();
  const mediaData = trimmed.startsWith('{') ? (() => {
    try { return JSON.parse(trimmed) as MediaData; } catch { return null; }
  })() : null;

  // Check for text message in JSON format FIRST
  if (mediaData && typeof mediaData.text === 'string' && mediaData.text.trim()) {
    return mediaData.text;
  }

  const normalized = normalizeMediaData(mediaData);
  const inferredType = inferMediaType(normalized);
  const effectiveType = (messageType === 'text' || !messageType) && inferredType ? inferredType : messageType;

  // If it's a media type, return appropriate label
  switch (effectiveType) {
    case 'image': return '📷 Imagem';
    case 'video': return '🎥 Vídeo';
    case 'audio':
    case 'ptt': return '🎵 Áudio';
    case 'document': return '📄 Documento';
    case 'sticker': return '🏷️ Figurinha';
    case 'contacts': return '👤 Contato compartilhado';
  }
  
  // If JSON, prefer caption when available
  if (mediaData && normalized.caption) {
    return normalized.caption;
  }
  
  if (mediaData && (normalized.mediaKey || normalized.directPath)) {
    return '📎 Mídia';
  }
  
  if (mediaData) {
    return '📎 Anexo';
  }
  
  return content;
}
