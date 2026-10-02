import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export type Fridge = {
  id: string;
  image_url: string;
  created_at: string;
};

export type Area = {
  id: string;
  fridge_id: string;
  name: string;
  coordinates: { ymin: number; xmin: number; ymax: number; xmax: number };
  created_at: string;
};

export type Item = {
  id: string;
  area_id: string;
  name: string;
  quantity: number;
  created_at: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  last_used_at: string;
};
