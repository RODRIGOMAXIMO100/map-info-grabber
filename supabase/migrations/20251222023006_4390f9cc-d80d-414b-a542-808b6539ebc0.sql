-- Criar bucket para mídias de broadcast
INSERT INTO storage.buckets (id, name, public) 
VALUES ('broadcast-media', 'broadcast-media', true);

-- Política para permitir upload anônimo
CREATE POLICY "Allow public upload to broadcast-media" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'broadcast-media');

-- Política para permitir leitura pública
CREATE POLICY "Allow public read from broadcast-media" ON storage.objects
FOR SELECT USING (bucket_id = 'broadcast-media');

-- Política para permitir update
CREATE POLICY "Allow public update in broadcast-media" ON storage.objects
FOR UPDATE USING (bucket_id = 'broadcast-media');

-- Política para permitir delete
CREATE POLICY "Allow public delete from broadcast-media" ON storage.objects
FOR DELETE USING (bucket_id = 'broadcast-media');