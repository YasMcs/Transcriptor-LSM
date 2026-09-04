export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, lang } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }

    let systemPrompt = "";
    
    if (lang === 'en') {
        systemPrompt = `Eres un asistente experto para personas sordas en México. Recibirás un texto transcrito de una clase en inglés.
Debes devolver OBLIGATORIAMENTE un objeto JSON válido con dos claves:
1. "traduccion": La traducción del texto original inglés al español de forma natural.
2. "lsm": Una versión simplificada de la traducción pensada para personas sordas. Sigue el orden mental de LSM (primero el tiempo/contexto, luego lugar, luego quién, luego qué, luego la acción), pero escríbelo como una frase DIRECTA y LIMPIA, SIN etiquetas como "Tiempo:", "Lugar:", "Sujeto:", "Objeto:" ni "Verbo:". Solo la frase simplificada, sin artículos ni palabras de relleno. Ejemplo: "HOY CLASE → FUNCIÓN TRADUCCIÓN SERVIR" en lugar de "Tiempo: hoy. Lugar: clase. Sujeto: función...".
MATEMÁTICAS: Convierte expresiones matemáticas habladas a símbolos reales (ej. "x² + y", "3/2", "√9").
MODERACIÓN: Censura groserías con ***.`;
    } else {
        systemPrompt = `Eres un asistente experto para personas sordas en México. Recibirás un texto transcrito de una clase en español.
Debes devolver OBLIGATORIAMENTE un objeto JSON válido con una sola clave:
1. "lsm": Una versión simplificada del texto pensada para personas sordas. Sigue el orden mental de LSM (primero el tiempo/contexto, luego lugar, luego quién, luego qué, luego la acción), pero escríbelo como una frase DIRECTA y LIMPIA, SIN etiquetas como "Tiempo:", "Lugar:", "Sujeto:", "Objeto:" ni "Verbo:". Solo la frase simplificada, sin artículos ni palabras de relleno. Ejemplo: "HOY CLASE → FUNCIÓN TRADUCCIÓN SERVIR" en lugar de "Tiempo: presente. Lugar: clase. Sujeto: función...".
MATEMÁTICAS: Convierte expresiones matemáticas habladas a símbolos reales (ej. "x² + y", "3/4", "√9").
MODERACIÓN: Censura groserías con ***.`;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Error from OpenAI API');
        }

        const data = await response.json();
        const jsonResult = JSON.parse(data.choices[0].message.content);
        return res.status(200).json(jsonResult);
    } catch (error) {
        console.error('Process error:', error);
        return res.status(500).json({ error: error.message });
    }
}
