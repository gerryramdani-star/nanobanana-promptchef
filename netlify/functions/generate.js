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
Your goal is "Dynamic", "Explosive", and "Scroll-Stopping" visuals, BUT you must maintain PERFECT JSON SYNTAX.

**TASK:**
Convert user ideas into a sophisticated, highly detailed JSON Prompt. 
"Hallucinate" excessive details (textures, lighting) to make it look expensive.

**CRITICAL SYNTAX RULES:**
1. **ESCAPE QUOTES:** If a text description contains a quote, you MUST escape it. (e.g., "The sign says \\"HELLO\\"")
2. **NO COMMENTS:** Do not add // comments inside the JSON.
3. **COMPLETE JSON:** Do not stop generating until the final closing brace '}' is written.

**MANDATORY JSON SCHEMA:**
{
  "prompt": {
    "type": "Select best fit: Cinematic / High-Speed / Minimalist / Surreal / 3D Render",
    "subject_context": "Short context of the ad/image",
    "composition_logic": {
      "angle": "Dynamic Camera angle (e.g., Dutch Tilt, Worm's Eye, Macro). Avoid flat angles.",
      "depth_layering": "Explicitly define Foreground, Middleground, and Background.",
      "focus": "Focus point and depth of field details"
    },
    "visual_elements": {
      "main_subject": "High-detail description of the main object/product (textures, materials).",
      "action_elements": "MANDATORY: Add dynamic movement (flying debris, splashes, steam, light leaks).",
      "environment": "Background setting description with specific materials."
    },
    "typography_content": {
      "headline": "Main text",
      "sub_headline": "Secondary text",
      "cta_button": "Call to Action text"
    },
    "text_integration_styling": {
      "headline_style": {
        "font": "Font vibe description",
        "placement": "CRITICAL: The text must interact with the scene (Occlusion/Depth).",
        "material_and_lighting": "Define text material (e.g., 'Neon tube', 'Gold', 'Ice')."
      },
      "cta_style": "Describe the button as a physical object (e.g., 'Glass pill', 'Metal tag')."
    },
    "lighting_and_atmosphere": {
      "lighting_setup": "Complex lighting (e.g., Rim Light, Volumetric Rays, Neon Split).",
      "special_effects": "Lens flares, chromatic aberration, film grain, bokeh."
    },
    "color_palette": {
      "primary": "Hex/name",
      "secondary": "Hex/name",
      "contrast": "Hex/name"
    }
  }
}
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
                    temperature: 0.75, // Sedikit lebih rendah dari 0.85 agar lebih patuh struktur, tapi tetap kreatif
                    maxOutputTokens: 8192, // MAX CAPACITY: Agar tidak terpotong di tengah jalan!
                    responseMimeType: "application/json"
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

        // --- JSON CLEANING LOGIC ---
        let cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // Cari kurung kurawal terluar untuk membuang teks intro/outro sampah
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }
        
        let jsonResult;
        try {
            jsonResult = JSON.parse(cleanJson);
        } catch (e) {
            console.warn("Standard JSON Parse failed, attempting Loose Parse...");
            try {
                // Fallback: Menggunakan evaluasi JS yang lebih pemaaf
                jsonResult = (new Function(`return ${cleanJson}`))();
            } catch (e2) {
                console.error("All parsing failed.", e2);
                jsonResult = { 
                    "error": "Maaf, AI kehabisan napas saat menulis detail yang sangat panjang. Silakan coba lagi.",
                    "raw_output": cleanJson 
                };
            }
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
