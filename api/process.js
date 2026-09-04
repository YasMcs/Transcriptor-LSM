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
        systemPrompt = `Recibirás texto transcrito por Whisper. Devuelve un JSON con dos claves:

1. "traduccion": Traducción fiel al español.
2. "lsm": Adaptación a Lengua de Señas Mexicana (LSM) simplificada.

REGLAS ESTRICTAS PARA LSM:
- Identifica el tema principal y el sentido exacto de lo que quiere decir el maestro.
- Extrae e interpreta modismos o expresiones complejas, reescribiéndolos con palabras más sencillas.
- Adapta la oración a la estructura gramatical LSM: Tiempo → Lugar → Sujeto → Objeto → Verbo.
- Elimina artículos (el, la, los, un, una) y conectores innecesarios.
- Escribe TODO en minúsculas.
- NO utilices etiquetas como "Tiempo:", "Lugar:", etc. Solo la frase limpia.`;
    } else {
        systemPrompt = `Recibirás texto transcrito por Whisper en español. Devuelve un JSON con una sola clave:

1. "lsm": Adaptación a Lengua de Señas Mexicana (LSM) simplificada.

REGLAS ESTRICTAS PARA LSM:
- Identifica el tema principal y el sentido exacto de lo que quiere decir el maestro.
- Extrae e interpreta modismos o expresiones complejas, reescribiéndolos con palabras más sencillas.
- Adapta la oración a la estructura gramatical LSM: Tiempo → Lugar → Sujeto → Objeto → Verbo.
- Elimina artículos (el, la, los, un, una) y conectores innecesarios.
- Escribe TODO en minúsculas.
- NO utilices etiquetas como "Tiempo:", "Lugar:", etc. Solo la frase limpia.`;
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
                temperature: 0
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
