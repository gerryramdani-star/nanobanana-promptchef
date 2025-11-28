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
        const { prompt, style, font, lighting, ratio, language } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("FATAL: GEMINI_API_KEY is missing.");
            throw new Error("API Key belum disetting di Netlify Environment Variables.");
        }

        const systemPrompt = `
**ROLE:**
You are a World-Class Commercial Creative Director specializing in High-Impact Advertising & Nano Banana Pro (Gemini Image 3).
Your enemy is "Boring". Your goal is "Dynamic", "Explosive", and "Scroll-Stopping" visuals.

**TASK:**
Convert simple user ideas into a sophisticated, highly detailed JSON Prompt. 
You must "hallucinate" excessive details (micro-textures, physics, lighting interactions) to make the image look expensive.

**MANDATORY JSON SCHEMA:**
{
  "prompt": {
    "type": "Select best fit: Cinematic / High-Speed / Minimalist / Surreal / 3D Render",
    "subject_context": "Short context of the ad/image",
    "composition_logic": {
      "angle": "Dynamic Camera angle (e.g., Dutch Tilt, Worm's Eye, Macro, Wide distortion). NEVER use flat/boring angles.",
      "depth_layering": "Explicitly define Foreground (blurred particles), Middleground (Hero), and Background. CREATE DEPTH.",
      "focus": "Focus point and depth of field details"
    },
    "visual_elements": {
      "main_subject": "High-detail description of the main object/product. Mention textures (sweat droplets, scratches, fabric weave, oil sheen).",
      "action_elements": "MANDATORY: Add dynamic movement. (e.g., Flying debris, splashing liquids, rising steam, floating particles, light leaks, motion blur). Make it busy and alive.",
      "environment": "Background setting description with specific materials (concrete, brushed metal, wood, neon grid)."
    },
    "typography_content": {
      "headline": "Main text",
      "sub_headline": "Secondary text",
      "cta_button": "Call to Action text"
    },
    "text_integration_styling": {
      "headline_style": {
        "font": "Font vibe description",
        "placement": "CRITICAL: The text must interact with the scene. Use 'OCCLUSION' (e.g., 'The burger slightly covers the letter B', 'Smoke weaves through the text'). DO NOT just paste text on top.",
        "material_and_lighting": "Define text material (e.g., 'Brushed Gold reacting to light', 'Neon tube', 'Frosted Glass', 'Burning Ember')."
      },
      "cta_style": "Describe the button as a physical object. (e.g., 'Glassmorphism pill shape with inner glow', 'Distressed metal tag', '3D floating button'). NOT just 'a red button'."
    },
    "lighting_and_atmosphere": {
      "lighting_setup": "Complex lighting (e.g., 'Rim Light + Soft Fill', 'Volumetric God Rays', 'Cyberpunk Neon Split Lighting'). Avoid flat lighting.",
      "special_effects": "Lens flares, chromatic aberration, film grain, bokeh, volumetric fog, heat haze."
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
2. ALWAYS enforce 'Occlusion' logic. The text should feel like it's physically IN the scene.
3. Use sensory language (e.g., "glistening", "sizzling", "velvety", "translucent", "gritty").
4. Output RAW JSON only.
`;

        let constraints = "";
        if (style || font || lighting || ratio || language) {
            constraints += "\n**CRITICAL USER OVERRIDES (YOU MUST FOLLOW THESE):**\n";
            if (style) constraints += `- Visual Style: Force the image style to be "${style}".\n`;
            if (font) constraints += `- Typography Style: Use "${font}" font style for the text.\n`;
            if (lighting) constraints += `- Lighting & Atmosphere: Enforce "${lighting}" mood.\n`;
            if (ratio) constraints += `- Aspect Ratio Target: ${ratio} (Adjust composition logic to fit this frame).\n`;
            if (language) constraints += `- Text Language: Ensure spelling of text content is strictly in "${language}".\n`;
        }

        async function getAvailableModel() {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(listUrl);
            const data = await response.json();

            if (data.error) throw new Error(`Gagal cek model: ${data.error.message}`);
            if (!data.models) throw new Error("API Key valid tapi tidak ada model yang tersedia.");

            const flashModel = data.models.find(m => m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent'));
            const proModel = data.models.find(m => m.name.includes('pro') && m.supportedGenerationMethods.includes('generateContent'));
            const anyModel = data.models.find(m => m.supportedGenerationMethods.includes('generateContent'));

            const selected = flashModel || proModel || anyModel;
            if (!selected) throw new Error("Tidak ditemukan model yang mendukung 'generateContent' di akun ini.");

            return selected.name.replace('models/', '');
        }

        async function runInference() {
            const modelName = await getAvailableModel();
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const finalPrompt = `SYSTEM INSTRUCTION:\n${systemPrompt}\n${constraints}\nUSER INPUT:\n${prompt}`;

            const payload = {
                contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
                generationConfig: {
                    temperature: 0.85,
                    maxOutputTokens: 2000,
                    responseMimeType: "application/json" // PERBAIKAN: Memaksa Output JSON Murni
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

        const rawText = await runInference();

        // PERBAIKAN: Pembersih JSON yang Lebih Cerdas
        // Mencari kurung kurawal pertama '{' dan terakhir '}' untuk membuang teks sampah
        let cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }
        
        let jsonResult;
        try {
            jsonResult = JSON.parse(cleanJson);
        } catch (e) {
            console.error("JSON Parse Error, sending raw text.", e);
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
