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
        // PERBAIKAN: Menerima parameter tambahan dari Frontend
        const { prompt, style, font, lighting, ratio, language } = JSON.parse(event.body);
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

        // PERBAIKAN: Membangun Blok Constraint (Aturan Paksa)
        let constraints = "";
        if (style || font || lighting || ratio || language) {
            constraints += "\n**CRITICAL USER OVERRIDES (YOU MUST FOLLOW THESE):**\n";
            if (style) constraints += `- Visual Style: Force the image style to be "${style}".\n`;
            if (font) constraints += `- Typography Style: Use "${font}" font style for the text.\n`;
            if (lighting) constraints += `- Lighting & Atmosphere: Enforce "${lighting}" mood.\n`;
            if (ratio) constraints += `- Aspect Ratio Target: ${ratio} (Adjust composition logic to fit this frame).\n`;
            if (language) constraints += `- Text Language: Ensure spelling of text content is strictly in "${language}".\n`;
        }

        // --- FUNGSI 1: CARI MODEL YANG TERSEDIA (AUTO-DISCOVERY) ---
        async function getAvailableModel() {
            console.log("Auto-discovering available models...");
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            
            const response = await fetch(listUrl);
            const data = await response.json();

            if (data.error) {
                throw new Error(`Gagal cek model: ${data.error.message}`);
            }

            if (!data.models) {
                throw new Error("API Key valid tapi tidak ada model yang tersedia.");
            }

            // Prioritas pencarian: Cari yang ada kata 'flash' (cepat), kalau ga ada cari 'pro', kalau ga ada ambil sembarang yang bisa generateContent
            const flashModel = data.models.find(m => m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent'));
            const proModel = data.models.find(m => m.name.includes('pro') && m.supportedGenerationMethods.includes('generateContent'));
            const anyModel = data.models.find(m => m.supportedGenerationMethods.includes('generateContent'));

            const selected = flashModel || proModel || anyModel;

            if (!selected) {
                throw new Error("Tidak ditemukan model yang mendukung 'generateContent' di akun ini.");
            }

            // Nama model dari list biasanya formatnya "models/gemini-1.5-flash". 
            // Kita butuh nama bersihnya atau pakai langsung.
            // API generateContent butuh URL: .../v1beta/models/{MODEL_NAME}:generateContent
            // Data dari list sudah berbentuk "models/gemini-xyz", jadi kita harus hati-hati parsingnya.
            
            // Contoh nama dari list: "models/gemini-1.5-flash-001"
            // Kita ambil bagian setelah "models/"
            const modelName = selected.name.replace('models/', '');
            console.log(`Model terpilih: ${modelName}`);
            return modelName;
        }

        // --- FUNGSI 2: EKSEKUSI PROMPT ---
        async function runInference() {
            // Langkah 1: Cari model dulu
            const modelName = await getAvailableModel();

            // Langkah 2: Panggil model tersebut
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            
            // PERBAIKAN: Menyisipkan constraints ke dalam prompt
            const finalPrompt = `SYSTEM INSTRUCTION:\n${systemPrompt}\n${constraints}\nUSER INPUT:\n${prompt}`;

            const payload = {
                contents: [{
                    role: "user",
                    parts: [{ text: finalPrompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error.message);
            if (!data.candidates || data.candidates.length === 0) throw new Error("Empty candidates");

            return data.candidates[0].content.parts[0].text;
        }

        // --- EKSEKUSI UTAMA ---
        const rawText = await runInference();

        // --- BERSIH-BERSIH OUTPUT ---
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let jsonResult;
        try {
            jsonResult = JSON.parse(cleanJson);
        } catch (e) {
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
            body: JSON.stringify({ error: `Gagal: ${error.message}` })
        };
    }
};
