-- 1. Create Tables for The Fridge App (TFA prefix)
CREATE TABLE IF NOT EXISTS TFA_fridges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS TFA_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fridge_id UUID REFERENCES TFA_fridges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coordinates JSONB NOT NULL, -- { ymin, xmin, ymax, xmax } scaled 0-1000
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS TFA_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area_id UUID REFERENCES TFA_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS TFA_item_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Disable Row Level Security (RLS) for Phase 1 (public/shared app without auth)
ALTER TABLE TFA_fridges DISABLE ROW LEVEL SECURITY;
ALTER TABLE TFA_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE TFA_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE TFA_item_catalog DISABLE ROW LEVEL SECURITY;

-- 3. Create 'images' Storage Bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Enable public upload & read access for 'images' storage bucket
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
