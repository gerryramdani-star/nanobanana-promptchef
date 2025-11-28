// netlify/functions/generate.js

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
        const { prompt } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("FATAL: GEMINI_API_KEY is missing.");
            throw new Error("API Key belum disetting di Netlify Environment Variables.");
        }

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
      "angle": "Camera angle",
      "depth_layering": "Explicitly define Foreground, Middleground, and Background elements.",
      "focus": "Focus point and depth of field details"
    },
    "visual_elements": {
      "main_subject": "High-detail description of the main object/product",
      "action_elements": "Any movement?",
      "environment": "Background setting description"
    },
    "typography_content": {
      "headline": "Main text",
      "sub_headline": "Secondary text",
      "cta_button": "Call to Action text"
    },
    "text_integration_styling": {
      "headline_style": {
        "font": "Font vibe description",
        "placement": "CRITICAL: Describe how the text sits in the 3D space. Use 'OCCLUSION' logic.",
        "material_and_lighting": "What is the text made of?"
      },
      "cta_style": "Button style description"
    },
    "lighting_and_atmosphere": {
      "lighting_setup": "Studio lighting setup",
      "special_effects": "Particle effects, lens flares, chromatic aberration"
    },
    "color_palette": {
      "primary": "Hex or name",
      "secondary": "Hex or name",
      "contrast": "Hex or name"
    }
  }
}

**RULES:**
1. If the user doesn't provide specific text, invent catchy, short marketing copy.
2. ALWAYS enforce 'Occlusion' logic where the subject slightly blocks the text.
3. Use sensory language.
4. Output RAW JSON only. Do not use Markdown backticks.
`;

        // --- FUNGSI PEMANGGIL AI (DENGAN COBA ULANG) ---
        async function callGemini(modelName) {
            console.log(`Trying model: ${modelName}...`);
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            
            // Kita gabungkan System Prompt ke dalam User Prompt agar kompatibel dengan model lama (gemini-pro) juga
            const finalPrompt = `SYSTEM INSTRUCTION:\n${systemPrompt}\n\nUSER INPUT:\n${prompt}`;

            const payload = {
                contents: [{
                    role: "user",
                    parts: [{ text: finalPrompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000,
                    // responseMimeType: "application/json" // Kita hapus ini sementara karena gemini-pro kadang strict
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message); // Lempar error agar bisa ditangkap catch
            }
            
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("Empty candidates");
            }

            return data.candidates[0].content.parts[0].text;
        }

        // --- LOGIKA UTAMA: COBA 1.5 FLASH -> FALLBACK KE PRO ---
        let rawText;
        try {
            // Percobaan 1: Pakai Flash (Terbaik)
            rawText = await callGemini('gemini-1.5-flash');
        } catch (error) {
            console.warn("Flash model failed, switching to fallback...", error.message);
            try {
                // Percobaan 2: Pakai Pro (Cadangan Stabil)
                rawText = await callGemini('gemini-pro');
            } catch (fallbackError) {
                // Jika dua-duanya gagal, baru kita nyerah
                throw new Error(`Semua model gagal. Error terakhir: ${fallbackError.message}`);
            }
        }

        // --- PEMBERSIHAN JSON ---
        // Kadang AI ngasih ```json di awal, kita harus bersihkan
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let jsonResult;
        try {
            jsonResult = JSON.parse(cleanJson);
        } catch (e) {
            // Jika gagal parse JSON (karena model lama mungkin agak ngelantur), kita kirim teks mentahnya saja dalam wrapper
            console.error("JSON Parse Error, sending raw text.");
            jsonResult = { 
                error: "Format JSON tidak sempurna, tapi ini hasilnya:", 
                raw_output: cleanJson 
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: jsonResult })
        };

    } catch (error) {
        console.error("Function execution failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
