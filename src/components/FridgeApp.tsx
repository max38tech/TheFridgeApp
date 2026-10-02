'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, type Fridge, type Area, type Item } from '@/lib/supabase';
import { mapFridgeDoors, identifyItem } from '@/app/actions';
import { Camera, Plus, Loader2 } from 'lucide-react';

export default function FridgeApp() {
  const [fridge, setFridge] = useState<Fridge | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // App state
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [offlineItems, setOfflineItems] = useState<Record<string, Item[]>>({}); // areaId -> items
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    // Load offline cache
    const cached = localStorage.getItem('tfa_offline_items');
    if (cached) {
      try {
        setOfflineItems(JSON.parse(cached));
      } catch (e) {}
    }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Get the first fridge (since it's shared/no-auth)
      const { data: fridgeData } = await supabase.from('TFA_fridges').select('*').limit(1).single();
      if (fridgeData) {
        setFridge(fridgeData);
        const { data: areasData } = await supabase.from('TFA_areas').select('*').eq('fridge_id', fridgeData.id);
        if (areasData) setAreas(areasData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupFridge(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // 1. Convert image to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      // 2. Upload image to Supabase Storage (assuming a bucket named 'images' exists)
      // Alternatively, for MVP without storage bucket setup, we could store base64 in DB (not recommended for scale, but ok for MVP)
      // Let's assume we store base64 in DB for true zero-config MVP, or require user to create a bucket.
      // Wait, let's use Supabase storage. The user will need to create a bucket 'images'.
      const fileName = `fridge-${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
      
      if (uploadError) {
        // Fallback to storing a small base64 just in case they didn't create the bucket
        console.warn("Storage upload failed, falling back to data URL");
      }
      
      const imageUrl = uploadError 
        ? `data:${file.type};base64,${base64}` 
        : supabase.storage.from('images').getPublicUrl(fileName).data.publicUrl;

      // 3. Create Fridge record
      const { data: newFridge } = await supabase.from('TFA_fridges').insert({ image_url: imageUrl }).select().single();
      if (!newFridge) throw new Error("Failed to create fridge");

      // 4. Map areas with AI
      const mappedAreas = await mapFridgeDoors(base64, file.type);
      
      // 5. Save areas
      const areasToInsert = mappedAreas.map((a: any) => ({
        fridge_id: newFridge.id,
        name: a.name,
        coordinates: a.coordinates,
      }));
      
      const { data: newAreas } = await supabase.from('TFA_areas').insert(areasToInsert).select();
      
      setFridge(newFridge);
      if (newAreas) setAreas(newAreas);
      
    } catch (error) {
      alert("Error setting up fridge: " + error);
    } finally {
      setUploading(false);
    }
  }

  async function loadItemsForArea(area: Area) {
    setSelectedArea(area);
    
    // Check if online via navigator
    if (!navigator.onLine) {
      setItems(offlineItems[area.id] || []);
      return;
    }
    
    const { data } = await supabase.from('TFA_items').select('*').eq('area_id', area.id);
    if (data) {
      setItems(data);
      // Update cache
      const newCache = { ...offlineItems, [area.id]: data };
      setOfflineItems(newCache);
      localStorage.setItem('tfa_offline_items', JSON.stringify(newCache));
    }
  }

  async function handleAddItem(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedArea || !fridge) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const itemName = await identifyItem(base64, file.type);
      const confirmedName = prompt("AI identified this as:", itemName);
      
      if (confirmedName) {
        const { data: newItem } = await supabase.from('TFA_items').insert({
          area_id: selectedArea.id,
          name: confirmedName,
        }).select().single();

        if (newItem) {
          setItems([...items, newItem]);
          // Also add to catalog (ignoring errors if it exists)
          await supabase.from('TFA_item_catalog').insert({ name: confirmedName });
        }
      }
    } catch (error) {
      alert("Error adding item");
    } finally {
      setUploading(false);
    }
  }
  
  async function handleDeleteItem(id: string) {
    await supabase.from('TFA_items').delete().eq('id', id);
    setItems(items.filter(i => i.id !== id));
  }

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-8 h-8" /></div>;

  if (!fridge) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to The Fridge App</h1>
        <p className="mb-8 text-gray-600">Take a photo of your fridge to get started. Our AI will automatically map the doors and sections.</p>
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-blue-600 text-white px-6 py-3 rounded-full font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
          {uploading ? 'Analyzing Fridge...' : 'Setup Fridge'}
        </button>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          className="hidden" 
          ref={fileInputRef}
          onChange={handleSetupFridge}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4 text-center font-bold text-lg">
        The Fridge App
      </header>

      {/* Main Fridge View */}
      <main className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        <img src={fridge.image_url} alt="Fridge" className="max-h-full max-w-full object-contain" />
        
        {/* Overlays */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative" style={{ aspectRatio: 'auto', height: '100%' }}>
             {/* Note: In a real implementation, we need to map the 0-1000 AI coordinates 
                 exactly over the rendered image bounding box. For MVP, we assume the container matches the image aspect ratio. */}
             {areas.map(area => {
                // Gemini coordinates are typically 0-1000 representing scaled [ymin, xmin, ymax, xmax]
                const ymin = area.coordinates.ymin / 10;
                const xmin = area.coordinates.xmin / 10;
                const ymax = area.coordinates.ymax / 10;
                const xmax = area.coordinates.xmax / 10;
                
                return (
                  <div 
                    key={area.id}
                    onClick={() => loadItemsForArea(area)}
                    className="absolute border-2 border-blue-400/50 bg-blue-400/20 cursor-pointer pointer-events-auto hover:bg-blue-400/40 transition-colors flex items-center justify-center backdrop-blur-[1px]"
                    style={{
                      top: `${ymin}%`,
                      left: `${xmin}%`,
                      height: `${ymax - ymin}%`,
                      width: `${xmax - xmin}%`,
                    }}
                  >
                    <span className="bg-black/50 text-white text-xs font-bold px-2 py-1 rounded">
                      {area.name}
                    </span>
                  </div>
                );
             })}
          </div>
        </div>
      </main>

      {/* Area Bottom Sheet Modal */}
      {selectedArea && (
        <div className="absolute inset-0 bg-black/50 flex flex-col justify-end z-50">
          <div className="bg-white rounded-t-2xl p-4 min-h-[50vh] max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{selectedArea.name}</h2>
              <button onClick={() => setSelectedArea(null)} className="text-gray-500 p-2">Close</button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No items here yet.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map(item => (
                    <li key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium">{item.name}</span>
                      <button onClick={() => handleDeleteItem(item.id)} className="text-red-500 text-sm font-medium">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button 
                onClick={() => itemFileInputRef.current?.click()}
                disabled={uploading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium flex justify-center items-center gap-2"
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Camera className="w-5 h-5" />}
                {uploading ? 'Identifying...' : 'Add Item with Camera'}
              </button>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                ref={itemFileInputRef}
                onChange={handleAddItem}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
