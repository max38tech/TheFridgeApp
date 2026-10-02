-- 1. Create Tables for The Fridge App (lowercase for PostgreSQL compatibility)
CREATE TABLE IF NOT EXISTS tfa_fridges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tfa_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fridge_id UUID REFERENCES tfa_fridges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coordinates JSONB NOT NULL, -- { ymin, xmin, ymax, xmax } scaled 0-1000
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tfa_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area_id UUID REFERENCES tfa_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tfa_item_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Grant permissions to public roles (anon and authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

GRANT ALL ON TABLE tfa_fridges TO anon, authenticated, service_role;
GRANT ALL ON TABLE tfa_areas TO anon, authenticated, service_role;
GRANT ALL ON TABLE tfa_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE tfa_item_catalog TO anon, authenticated, service_role;

-- 3. Disable Row Level Security (RLS) for Phase 1 (no auth)
ALTER TABLE tfa_fridges DISABLE ROW LEVEL SECURITY;
ALTER TABLE tfa_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE tfa_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE tfa_item_catalog DISABLE ROW LEVEL SECURITY;

-- 4. Create 'images' Storage Bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. Enable public upload & read access for 'images' storage bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Public Access TFA Images'
  ) THEN
    CREATE POLICY "Public Access TFA Images"
    ON storage.objects FOR ALL
    USING (bucket_id = 'images')
    WITH CHECK (bucket_id = 'images');
  END IF;
END $$;

-- 6. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
