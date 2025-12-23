import { useState, useRef } from 'react';
import { ImagePlus, Paperclip, X, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MediaUploaderProps {
  onMediaReady: (url: string, type: 'image' | 'video' | 'document' | 'audio', file: File) => void;
  disabled?: boolean;
}

export function MediaUploader({ onMediaReady, disabled }: MediaUploaderProps) {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine media type
    let mediaType: 'image' | 'video' | 'document' | 'audio' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    // Size check (max 16MB)
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo é 16MB.',
        variant: 'destructive',
      });
      return;
    }

    // Upload to Supabase Storage
    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage
        .from('broadcast-media')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('broadcast-media')
        .getPublicUrl(data.path);

      onMediaReady(urlData.publicUrl, mediaType, file);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro no upload',
        description: 'Não foi possível enviar o arquivo.',
        variant: 'destructive',
      });
    }

    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'image')}
        disabled={disabled}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'file')}
        disabled={disabled}
      />
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground hover:text-foreground"
        onClick={() => imageInputRef.current?.click()}
        disabled={disabled}
        title="Enviar imagem ou vídeo"
      >
        <ImagePlus className="h-5 w-5" />
      </Button>
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground hover:text-foreground"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Enviar arquivo"
      >
        <Paperclip className="h-5 w-5" />
      </Button>
    </>
  );
}

interface MediaPreviewProps {
  file: File;
  url: string;
  type: 'image' | 'video' | 'document' | 'audio';
  onRemove: () => void;
  uploading?: boolean;
}

export function MediaPreview({ file, url, type, onRemove, uploading }: MediaPreviewProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg mb-2">
      {uploading ? (
        <div className="h-12 w-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : type === 'image' ? (
        <img src={url} alt="Preview" className="h-12 w-12 object-cover rounded" />
      ) : type === 'video' ? (
        <video src={url} className="h-12 w-12 object-cover rounded" />
      ) : (
        <div className="h-12 w-12 flex items-center justify-center bg-background rounded">
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {(file.size / 1024).toFixed(1)} KB
        </p>
      </div>
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onRemove}
        disabled={uploading}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
