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
        systemPrompt = `Eres un asistente experto para personas sordomudas en México. Recibirás un texto transcrito de una clase en inglés.
Debes devolver OBLIGATORIAMENTE un objeto JSON válido con dos claves:
1. "traduccion": La traducción del texto original inglés al español de forma natural.
2. "lsm": Una simplificación de esa traducción pensada para personas sordomudas usando estructura básica de LSM (Tiempo + Lugar + Sujeto + Objeto + Verbo) y omitiendo artículos/relleno.
MATEMÁTICAS: Si identificas números, fórmulas o expresiones matemáticas habladas (ej. "x squared plus y", "three over two", "square root of nine"), debes convertirlas a símbolos matemáticos reales (ej. "x² + y", "3/2", "√9") en tus resultados.
MODERACIÓN CRÍTICA: Censura cualquier grosería o palabra altisonante (tanto en inglés como en español) sustituyéndola por asteriscos (***).`;
    } else {
        systemPrompt = `Eres un asistente experto para personas sordomudas en México. Recibirás un texto transcrito de una clase en español.
Debes devolver OBLIGATORIAMENTE un objeto JSON válido con una sola clave:
1. "lsm": Una simplificación de ese texto pensada para personas sordomudas usando estructura básica de LSM (Tiempo + Lugar + Sujeto + Objeto + Verbo) y omitiendo artículos/relleno.
MATEMÁTICAS: Si identificas números, fórmulas o expresiones matemáticas habladas (ej. "x al cuadrado más ye", "tres cuartos", "raíz de nueve"), debes convertirlas a símbolos matemáticos reales (ej. "x² + y", "3/4", "√9") en tu resultado.
MODERACIÓN CRÍTICA: Censura cualquier grosería o palabra altisonante sustituyéndola por asteriscos (***).`;
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
