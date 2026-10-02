'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, type Fridge, type Area, type Item, type CatalogItem } from '@/lib/supabase';
import { mapFridgeDoors, identifyItem } from '@/app/actions';
import { Camera, Plus, Loader2, RefreshCw, Trash2, Check, X } from 'lucide-react';

// Helper to compress camera photos on mobile devices to prevent payload-size limits
async function compressImage(file: File, maxDimension = 1200, quality = 0.82): Promise<{ blob: Blob; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file from camera'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image in browser'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context is unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Image compression failed'));
            return;
          }
          resolve({ blob, base64, mimeType: 'image/jpeg' });
        }, 'image/jpeg', quality);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function FridgeApp() {
  const [fridge, setFridge] = useState<Fridge | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Area view state
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [offlineItems, setOfflineItems] = useState<Record<string, Item[]>>({});
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<string>('');
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    // Load cached offline items
    const cached = localStorage.getItem('tfa_offline_items');
    if (cached) {
      try {
        setOfflineItems(JSON.parse(cached));
      } catch (e) {
        console.warn('Failed to parse offline cache', e);
      }
    }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Fetch fridge
      const { data: fridgeData, error: fridgeError } = await supabase
        .from('tfa_fridges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fridgeError) {
        console.warn('Could not load fridge from Supabase:', fridgeError.message);
      } else if (fridgeData) {
        setFridge(fridgeData);
        // 2. Fetch areas
        const { data: areasData } = await supabase
          .from('tfa_areas')
          .select('*')
          .eq('fridge_id', fridgeData.id);
        if (areasData) setAreas(areasData);
      }

      // 3. Fetch catalog of previous items
      const { data: catalogData } = await supabase
        .from('tfa_item_catalog')
        .select('*')
        .order('name', { ascending: true });
      if (catalogData) {
        setCatalog(catalogData);
      }
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupFridge(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    setStatusMessage('Compressing photo...');

    try {
      // 1. Compress image for mobile speed & payload limits
      const { blob, base64, mimeType } = await compressImage(file, 1200, 0.82);

      // 2. Upload to Supabase Storage (or fallback to data URL)
      setStatusMessage('Saving fridge image...');
      const fileName = `fridge-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

      let imageUrl: string;
      if (uploadError) {
        console.warn('Supabase storage upload error, using direct inline data URL:', uploadError.message);
        imageUrl = `data:${mimeType};base64,${base64}`;
      } else {
        const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(fileName);
        imageUrl = publicUrlData.publicUrl;
      }

      // 3. Insert Fridge record
      setStatusMessage('Creating fridge record...');
      const { data: newFridge, error: fridgeInsertError } = await supabase
        .from('tfa_fridges')
        .insert({ image_url: imageUrl })
        .select()
        .single();

      if (fridgeInsertError || !newFridge) {
        throw new Error(
          fridgeInsertError?.message.includes('relation "public.tfa_fridges" does not exist') ||
          fridgeInsertError?.message.includes('Could not find the table')
            ? "Database tables have not been created yet. Please execute 'supabase-schema.sql' in your Supabase SQL editor!"
            : `Failed to create fridge in database: ${fridgeInsertError?.message || 'Unknown database error'}`
        );
      }

      // 4. Map areas with Gemini 3.8 Flash
      setStatusMessage('AI analyzing fridge doors & compartments...');
      const mappedAreas = await mapFridgeDoors(base64, mimeType);

      // 5. Insert Areas
      setStatusMessage('Saving compartments...');
      const areasToInsert = mappedAreas.map((a: any) => ({
        fridge_id: newFridge.id,
        name: a.name || 'Compartment',
        coordinates: a.coordinates || { ymin: 100, xmin: 100, ymax: 900, xmax: 900 },
      }));

      const { data: newAreas, error: areasInsertError } = await supabase
        .from('tfa_areas')
        .insert(areasToInsert)
        .select();

      if (areasInsertError) {
        console.warn('Failed to insert areas:', areasInsertError.message);
      }

      setFridge(newFridge);
      if (newAreas) setAreas(newAreas);
    } catch (error: any) {
      console.error('Error setting up fridge:', error);
      alert(error?.message || 'An error occurred while setting up the fridge.');
    } finally {
      setUploading(false);
      setStatusMessage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function loadItemsForArea(area: Area) {
    setSelectedArea(area);
    setSelectedCatalogItem('');

    // If offline, use cache
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setItems(offlineItems[area.id] || []);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tfa_items')
        .select('*')
        .eq('area_id', area.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching items:', error.message);
        setItems(offlineItems[area.id] || []);
      } else if (data) {
        setItems(data);
        const newCache = { ...offlineItems, [area.id]: data };
        setOfflineItems(newCache);
        localStorage.setItem('tfa_offline_items', JSON.stringify(newCache));
      }
    } catch (e) {
      setItems(offlineItems[area.id] || []);
    }
  }

  async function handleAddItemWithCamera(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedArea || !fridge) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMessage('Compressing item photo...');

    try {
      const { base64, mimeType } = await compressImage(file, 800, 0.8);
      
      setStatusMessage('AI identifying grocery item...');
      const identifiedName = await identifyItem(base64, mimeType);
      
      const confirmedName = window.prompt('AI identified this item as:', identifiedName);
      if (confirmedName && confirmedName.trim()) {
        await saveItemToArea(confirmedName.trim());
      }
    } catch (error: any) {
      console.error('Error adding item:', error);
      alert(`Error identifying item: ${error?.message || error}`);
    } finally {
      setUploading(false);
      setStatusMessage('');
      if (itemFileInputRef.current) itemFileInputRef.current.value = '';
    }
  }

  async function handleAddCatalogItem() {
    if (!selectedCatalogItem || !selectedArea) return;
    await saveItemToArea(selectedCatalogItem);
    setSelectedCatalogItem('');
  }

  async function saveItemToArea(itemName: string) {
    if (!selectedArea) return;

    const { data: newItem, error: itemError } = await supabase
      .from('tfa_items')
      .insert({
        area_id: selectedArea.id,
        name: itemName,
        quantity: 1,
      })
      .select()
      .single();

    if (itemError) {
      alert(`Error saving item: ${itemError.message}`);
      return;
    }

    if (newItem) {
      const updated = [newItem, ...items];
      setItems(updated);
      
      // Update cache
      const newCache = { ...offlineItems, [selectedArea.id]: updated };
      setOfflineItems(newCache);
      localStorage.setItem('tfa_offline_items', JSON.stringify(newCache));

      // Add to catalog table if not present
      supabase
        .from('tfa_item_catalog')
        .upsert({ name: itemName, last_used_at: new Date().toISOString() }, { onConflict: 'name' })
        .then(() => {
          if (!catalog.some((c) => c.name.toLowerCase() === itemName.toLowerCase())) {
            setCatalog((prev) => [...prev, { id: Date.now().toString(), name: itemName, last_used_at: new Date().toISOString() }]);
          }
        });
    }
  }

  async function handleDeleteItem(id: string) {
    if (!selectedArea) return;
    const { error } = await supabase.from('tfa_items').delete().eq('id', id);
    if (error) {
      console.warn('Failed to delete from Supabase:', error.message);
    }
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    const newCache = { ...offlineItems, [selectedArea.id]: updated };
    setOfflineItems(newCache);
    localStorage.setItem('tfa_offline_items', JSON.stringify(newCache));
  }

  async function handleResetFridge() {
    if (!confirm('Are you sure you want to retake the fridge photo? This will reset mapped compartments.')) {
      return;
    }
    if (fridge) {
      await supabase.from('tfa_fridges').delete().eq('id', fridge.id);
    }
    setFridge(null);
    setAreas([]);
    setSelectedArea(null);
  }

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-3" />
        <p className="text-gray-600 font-medium">Loading The Fridge App...</p>
      </div>
    );
  }

  if (!fridge) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-6 text-center bg-gradient-to-b from-blue-50 to-white">
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
          <Camera className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">The Fridge App</h1>
        <p className="text-gray-600 max-w-sm mb-8 leading-relaxed">
          Snap a photo of your fridge. Gemini AI will automatically detect doors and compartments so you can track your inventory with a tap.
        </p>

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3.5 rounded-2xl font-semibold shadow-md">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{statusMessage || 'Processing...'}</span>
            </div>
            <p className="text-xs text-gray-400">This may take a few seconds</p>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold py-4 px-6 rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-3 transition-all cursor-pointer"
          >
            <Camera className="w-6 h-6" />
            <span>Take Fridge Photo</span>
          </button>
        )}

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
    <div className="flex flex-col h-screen bg-gray-900 text-white select-none">
      {/* Header */}
      <header className="bg-gray-900/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-800 z-10">
        <h1 className="font-bold text-lg tracking-wide flex items-center gap-2">
          <span>🧊</span> The Fridge App
        </h1>
        <button
          onClick={handleResetFridge}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-gray-800 border border-gray-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retake</span>
        </button>
      </header>

      {/* Main Interactive Fridge Photo */}
      <main className="flex-1 relative overflow-hidden flex items-center justify-center p-2">
        <div className="relative max-h-full max-w-full flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl">
          <img
            src={fridge.image_url}
            alt="My Fridge"
            className="max-h-[82vh] max-w-full object-contain rounded-xl"
          />

          {/* AI-mapped Clickable Compartments */}
          <div className="absolute inset-0 pointer-events-none">
            {areas.map((area) => {
              const ymin = (area.coordinates?.ymin || 0) / 10;
              const xmin = (area.coordinates?.xmin || 0) / 10;
              const ymax = (area.coordinates?.ymax || 1000) / 10;
              const xmax = (area.coordinates?.xmax || 1000) / 10;

              return (
                <button
                  key={area.id}
                  onClick={() => loadItemsForArea(area)}
                  className="absolute pointer-events-auto border-2 border-blue-400/70 bg-blue-500/20 active:bg-blue-500/40 hover:bg-blue-500/30 rounded-xl transition-all flex items-center justify-center shadow-lg group backdrop-blur-[0.5px]"
                  style={{
                    top: `${ymin}%`,
                    left: `${xmin}%`,
                    height: `${ymax - ymin}%`,
                    width: `${xmax - xmin}%`,
                  }}
                >
                  <span className="bg-gray-900/80 group-hover:bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full border border-white/20 shadow-md">
                    {area.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Area Drawer / Modal */}
      {selectedArea && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-end z-50">
          <div className="bg-white text-gray-900 rounded-t-3xl p-5 max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedArea.name}</h2>
                <p className="text-xs text-gray-500">{items.length} item{items.length === 1 ? '' : 's'} in this section</p>
              </div>
              <button
                onClick={() => setSelectedArea(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto py-3 my-1 space-y-2 min-h-[140px] max-h-[40vh]">
              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">No items in this section yet.</p>
                  <p className="text-xs mt-1">Take a photo or pick from previous items below.</p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100/80 rounded-xl border border-gray-100 transition-colors"
                  >
                    <span className="font-semibold text-gray-800 text-sm">{item.name}</span>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick Pick From Catalog */}
            {catalog.length > 0 && (
              <div className="pt-2 pb-3 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Or pick from previous items:
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedCatalogItem}
                    onChange={(e) => setSelectedCatalogItem(e.target.value)}
                    className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a previous item...</option>
                    {catalog.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddCatalogItem}
                    disabled={!selectedCatalogItem}
                    className="bg-gray-900 disabled:opacity-30 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>
            )}

            {/* Add with Camera Button */}
            <div className="pt-2">
              <button
                onClick={() => itemFileInputRef.current?.click()}
                disabled={uploading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:opacity-50 text-white py-3.5 px-4 rounded-2xl font-semibold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{statusMessage || 'Processing item...'}</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span>Scan Item with Camera</span>
                  </>
                )}
              </button>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={itemFileInputRef}
                onChange={handleAddItemWithCamera}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
