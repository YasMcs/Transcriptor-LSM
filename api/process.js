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
        systemPrompt = `Recibirás texto transcrito de una clase en inglés. Devuelve un JSON con dos claves:

1. "traduccion": Traducción fiel al español. NO agregues palabras ni contexto que no estén en el original.

2. "lsm": Simplificación para personas sordas (LSM). REGLAS ESTRICTAS:
- Usa ÚNICAMENTE palabras que aparecen en el texto original. NUNCA inventes ni agregues palabras que no se dijeron.
- Elimina solo artículos (el, la, los, un, una), preposiciones de relleno (de, en, con, por) y conectores innecesarios.
- Mantén el orden: contexto temporal → lugar → sujeto → objeto → verbo.
- NO pongas etiquetas como "Tiempo:", "Lugar:", etc. Solo la frase limpia.
- Si hay matemáticas habladas, usa símbolos: x², √9, 3/4.
- Censura groserías con ***.

Ejemplo: Si el texto dice "Today we are going to learn about functions", el LSM sería "HOY APRENDER FUNCIONES" — NO inventes palabras como "clase", "profesor", "importante" si no se dijeron.`;
    } else {
        systemPrompt = `Recibirás texto transcrito de una clase en español. Devuelve un JSON con una sola clave:

1. "lsm": Simplificación para personas sordas (LSM). REGLAS ESTRICTAS:
- Usa ÚNICAMENTE palabras que aparecen en el texto original. NUNCA inventes ni agregues palabras que no se dijeron.
- Elimina solo artículos (el, la, los, un, una), preposiciones de relleno (de, en, con, por) y conectores innecesarios.
- Mantén el orden: contexto temporal → lugar → sujeto → objeto → verbo.
- NO pongas etiquetas como "Tiempo:", "Lugar:", etc. Solo la frase limpia.
- Si hay matemáticas habladas, usa símbolos: x², √9, 3/4.
- Censura groserías con ***.

Ejemplo: Si el texto dice "Hoy vamos a aprender sobre las funciones matemáticas", el LSM sería "HOY APRENDER FUNCIONES MATEMÁTICAS" — NO inventes palabras como "clase", "profesor", "importante" si no se dijeron.`;
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
