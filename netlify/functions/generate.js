// netlify/functions/generate.js

// Fungsi ini berjalan di server Netlify (aman untuk menyimpan API Key)
export const handler = async (event) => {
    // 1. Handle Preflight Request (CORS)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 2. Ambil Input User & API Key
        const { prompt } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: "API Key belum disetting di Netlify." }) };
        }

        // 3. System Instruction (THE GOLDEN SCHEMA)
        // Ini adalah instruksi rahasia yang mengontrol kualitas output.
        const systemPrompt = `
**ROLE:**
You are a World-Class Creative Director and AI Prompt Engineer specializing in Nano Banana Pro (Gemini Image 3).
Your task is to convert simple user ideas into a sophisticated, structured JSON Prompt.

**MANDATORY JSON SCHEMA:**
You must output ONLY valid JSON based on this exact structure:
{
  "prompt": {
    "type": "Select best fit: Cinematic / High-Speed / Minimalist / Surreal / 3D Render",
    "subject_context": "Short context of the ad/image",
    "composition_logic": {
      "angle": "Camera angle (e.g., Worm's eye, Top down, Dutch angle)",
      "depth_layering": "Explicitly define Foreground, Middleground, and Background elements.",
      "focus": "Focus point and depth of field details"
    },
    "visual_elements": {
      "main_subject": "High-detail description of the main object/product",
      "action_elements": "Any movement? (Splashes, smoke, floating debris, steam, motion blur)",
      "environment": "Background setting description and material textures"
    },
    "typography_content": {
      "headline": "Main text (Use user input or invent a catchy short one)",
      "sub_headline": "Secondary text",
      "cta_button": "Call to Action text"
    },
    "text_integration_styling": {
      "headline_style": {
        "font": "Font vibe description (e.g., Bold Sans, Handwritten, Neon)",
        "placement": "CRITICAL: Describe how the text sits in the 3D space. Use 'OCCLUSION' logic (partially blocked by the subject) to create depth.",
        "material_and_lighting": "What is the text made of? (Neon, Metal, Plastic, Cloud, Fire)"
      },
      "cta_style": "Button style description"
    },
    "lighting_and_atmosphere": {
      "lighting_setup": "Studio lighting setup (Rim light, Softbox, Strobe, God rays)",
      "special_effects": "Particle effects, lens flares, chromatic aberration, volumetric fog"
    },
    "color_palette": {
      "primary": "Hex or name",
      "secondary": "Hex or name",
      "contrast": "Hex or name"
    }
  }
}

**RULES:**
1. If the user doesn't provide specific text, invent catchy, short marketing copy appropriate for the genre.
2. ALWAYS enforce 'Occlusion' logic where the subject slightly blocks the text (e.g., "The burger blocks the letter 'B'").
3. Use sensory language (e.g., "glistening", "crispy", "volumetric", "translucent").
4. Output RAW JSON only. Do not use Markdown backticks.
`;

        // 4. Panggil Gemini 1.5 Flash API
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{
                role: "user",
                parts: [{ text: `SYSTEM INSTRUCTION: ${systemPrompt}\n\nUSER INPUT: ${prompt}` }]
            }],
            generationConfig: {
                temperature: 0.7, // Kreativitas seimbang
                maxOutputTokens: 2000,
                responseMimeType: "application/json" // Memaksa output JSON murni
            }
        };

        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await apiResponse.json();

        // 5. Parse Hasilnya
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("Gemini tidak memberikan respon.");
        }

        const rawText = data.candidates[0].content.parts[0].text;
        
        // Membersihkan markdown jika ada (kadang AI masih bandel kasih ```json)
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResult = JSON.parse(cleanJson);

        // 6. Kirim Balik ke Frontend
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: jsonResult })
        };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};