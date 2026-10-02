'use server';

import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = 'gemini-2.5-flash';

export async function mapFridgeDoors(base64Image: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType,
              }
            },
            {
              text: `Analyze this image of a refrigerator. Identify the main compartments/doors. 
              Return a JSON array where each object has 'name' (string) and 'coordinates' (object with ymin, xmin, ymax, xmax). 
              The coordinates should be values between 0 and 1000 representing the bounding box relative to the image dimensions.
              Respond ONLY with the JSON array, no markdown formatting or extra text.`
            }
          ]
        }
      ]
    });
    
    let text = response.text || '[]';
    // Clean up potential markdown formatting
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Error mapping fridge doors:', error);
    throw new Error('Failed to map fridge doors');
  }
}

export async function identifyItem(base64Image: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType,
              }
            },
            {
              text: `Identify the main grocery/food item in this image. Give a short, simple, singular name for it (e.g., '1 liter milk carton', 'Apple', 'Ketchup'). Keep it under 5 words. Return ONLY the name.`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || 'Unknown Item';
  } catch (error) {
    console.error('Error identifying item:', error);
    throw new Error('Failed to identify item');
  }
}
