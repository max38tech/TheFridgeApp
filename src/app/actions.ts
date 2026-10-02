'use server';

import { GoogleGenAI } from '@google/genai';

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({ apiKey });
}

const MODEL_NAME = 'gemini-3.8-flash';

export async function mapFridgeDoors(base64Image: string, mimeType: string) {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType || 'image/jpeg',
              }
            },
            {
              text: `Analyze this image of a refrigerator. Identify the main compartments, doors, or sections (e.g. "Main Fridge Door", "Freezer Door", "Crisper Drawer", "Top Compartment").
Return a JSON array where each item has:
- "name": short string identifying the door or section
- "coordinates": an object with "ymin", "xmin", "ymax", "xmax" values as integers between 0 and 1000 representing the bounding box relative to the image dimensions.

Return ONLY the raw JSON array without markdown backticks or extra commentary.`
            }
          ]
        }
      ]
    });
    
    let text = response.text || '[]';
    // Clean up any markdown code fencing
    text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      // Fallback if AI couldn't detect distinct doors
      return [
        { name: 'Fridge Door', coordinates: { ymin: 100, xmin: 100, ymax: 500, xmax: 900 } },
        { name: 'Freezer Door', coordinates: { ymin: 520, xmin: 100, ymax: 900, xmax: 900 } }
      ];
    }
    return parsed;
  } catch (error: any) {
    console.error('Error in mapFridgeDoors:', error);
    throw new Error(`Failed to map fridge doors with AI: ${error?.message || error}`);
  }
}

export async function identifyItem(base64Image: string, mimeType: string) {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType || 'image/jpeg',
              }
            },
            {
              text: `Identify the main grocery, drink, or food item in this picture. Give a short, simple, generic name describing it (e.g., '1 liter milk carton', 'Butter', 'Eggs', 'Orange juice', 'Apples'). Do not include specific brands unless essential. Keep it under 5 words. Return ONLY the item name.`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || 'Unknown Item';
  } catch (error: any) {
    console.error('Error in identifyItem:', error);
    throw new Error(`Failed to identify item with AI: ${error?.message || error}`);
  }
}
