import { useState } from 'react';
import { Image, Video, Mic, FileText, Play, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MediaData {
  URL?: string;
  DirectPath?: string;
  JPEGThumbnail?: string;
  Seconds?: number;
  Mimetype?: string;
  Caption?: string;
  FileName?: string;
  FileLength?: number;
  FileSize?: number;
  media_url?: string;
}

interface MessageContentProps {
  content: string | null;
  messageType: string;
  mediaUrl?: string | null;
  direction: 'incoming' | 'outgoing';
}

// Parse JSON content safely
function parseMediaContent(content: string | null): MediaData | null {
  if (!content) return null;
  
  // Check if it looks like JSON
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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

export function MessageContent({ content, messageType, mediaUrl, direction }: MessageContentProps) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string>('');

  const isOutgoing = direction === 'outgoing';
  const mediaData = parseMediaContent(content);

  // Infer media type when backend stored message_type as "text" but content is JSON metadata
  const inferredType = (() => {
    if (!mediaData) return null;
    const mime = (mediaData.Mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('application/') || mime.includes('pdf')) return 'document';
    // Some payloads don't include mimetype but include thumbnails/duration
    if (mediaData.JPEGThumbnail) return 'image';
    if (typeof mediaData.Seconds === 'number') return 'audio';
    if (mediaData.FileName || mediaData.FileLength || mediaData.FileSize) return 'document';
    return null;
  })();

  const effectiveType = (messageType === 'text' || !messageType) && inferredType ? inferredType : messageType;

  // Get the best available image URL
  const getImageSource = (): string | null => {
    if (mediaUrl) return mediaUrl;
    if (mediaData?.media_url) return mediaData.media_url;
    if (mediaData?.JPEGThumbnail) return `data:image/jpeg;base64,${mediaData.JPEGThumbnail}`;
    if (mediaData?.URL) return mediaData.URL;
    return null;
  };

  // Handle image type
  if (effectiveType === 'image') {
    const imageSrc = getImageSource();
    const caption = mediaData?.Caption;

    if (imageSrc) {
      return (
        <>
          <div 
            className="cursor-pointer"
            onClick={() => {
              // For full view, prefer the original URL if available
              setFullImageUrl(mediaUrl || mediaData?.media_url || mediaData?.URL || imageSrc);
              setImageModalOpen(true);
            }}
          >
            <img 
              src={imageSrc}
              alt="Imagem"
              className="max-w-full rounded-lg max-h-64 object-cover"
              loading="lazy"
            />
            {caption && (
              <p className="text-sm mt-2 whitespace-pre-wrap break-words">{caption}</p>
            )}
          </div>
          
          <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
            <DialogContent className="max-w-4xl p-0 border-0 bg-transparent">
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
    
    // Fallback: show icon placeholder
    return (
      <div className={cn(
        "flex items-center gap-2 py-1",
        isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        <Image className="h-4 w-4" />
        <span className="text-sm">Imagem</span>
      </div>
    );
  }
  
  // Handle audio type
  if (effectiveType === 'audio' || effectiveType === 'ptt') {
    const audioUrl = mediaUrl || mediaData?.media_url || mediaData?.URL;
    const duration = mediaData?.Seconds;
    
    if (audioUrl) {
      return (
        <div className="flex items-center gap-2 min-w-[180px]">
          <audio 
            src={audioUrl}
            controls 
            className="h-10 max-w-full"
            style={{ width: '100%' }}
          />
        </div>
      );
    }
    
    // Fallback: show duration or icon
    return (
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
          {duration && (
            <span className="text-xs opacity-70">{formatDuration(duration)}</span>
          )}
        </div>
      </div>
    );
  }
  
  // Handle video type
  if (effectiveType === 'video') {
    const videoUrl = mediaUrl || mediaData?.media_url || mediaData?.URL;
    const thumbnail = mediaData?.JPEGThumbnail;
    const caption = mediaData?.Caption;
    const duration = mediaData?.Seconds;
    
    if (videoUrl) {
      return (
        <div>
          <video 
            src={videoUrl}
            controls
            className="max-w-full rounded-lg max-h-64"
            poster={thumbnail ? `data:image/jpeg;base64,${thumbnail}` : undefined}
          />
          {caption && (
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{caption}</p>
          )}
        </div>
      );
    }
    
    // Fallback with thumbnail
    if (thumbnail) {
      return (
        <div className="relative cursor-pointer">
          <img 
            src={`data:image/jpeg;base64,${thumbnail}`}
            alt="Vídeo"
            className="max-w-full rounded-lg max-h-64 object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/50 rounded-full p-3">
              <Play className="h-6 w-6 text-white fill-white" />
            </div>
          </div>
          {duration && (
            <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
              {formatDuration(duration)}
            </span>
          )}
          {caption && (
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{caption}</p>
          )}
        </div>
      );
    }
    
    // Fallback: icon only
    return (
      <div className={cn(
        "flex items-center gap-2 py-1",
        isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        <Video className="h-4 w-4" />
        <span className="text-sm">Vídeo</span>
        {duration && <span className="text-xs opacity-70">({formatDuration(duration)})</span>}
      </div>
    );
  }
  
  // Handle document type
  if (effectiveType === 'document') {
    const docUrl = mediaUrl || mediaData?.media_url || mediaData?.URL;
    const fileName = mediaData?.FileName || 'Documento';
    const fileSize = mediaData?.FileLength || mediaData?.FileSize;
    
    return (
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
          <p className="text-sm font-medium truncate">{fileName}</p>
          {fileSize && (
            <p className="text-xs opacity-70">{formatFileSize(fileSize)}</p>
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
    );
  }
  
  // Handle sticker type
  if (effectiveType === 'sticker') {
    const stickerUrl = mediaUrl || mediaData?.media_url || mediaData?.URL;
    
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
      <div className={cn(
        "flex items-center gap-2 py-1",
        isOutgoing ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        <span className="text-2xl">🏷️</span>
        <span className="text-sm">Figurinha</span>
      </div>
    );
  }
  
  // Default: text message
  // Check if content is actually JSON that we couldn't handle
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
    try { return JSON.parse(trimmed) as any; } catch { return null; }
  })() : null;

  const inferredType = (() => {
    if (!mediaData) return null;
    const mime = (mediaData.mimetype || mediaData.Mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime.includes('pdf') || mime.startsWith('application/')) return 'document';
    if (mediaData.JPEGThumbnail) return 'image';
    if (typeof mediaData.Seconds === 'number') return 'audio';
    return null;
  })();

  const effectiveType = (messageType === 'text' || !messageType) && inferredType ? inferredType : messageType;

  // If it's a media type, return appropriate label
  switch (effectiveType) {
    case 'image': return '📷 Imagem';
    case 'video': return '🎥 Vídeo';
    case 'audio':
    case 'ptt': return '🎵 Áudio';
    case 'document': return '📄 Documento';
    case 'sticker': return '🏷️ Figurinha';
  }
  
  // If JSON, prefer caption when available
  if (mediaData) {
    if (mediaData.Caption) return mediaData.Caption;
    if (mediaData.caption) return mediaData.caption;
    return inferredType ? '📎 Mídia' : '📎 Anexo';
  }
  return content;
}
