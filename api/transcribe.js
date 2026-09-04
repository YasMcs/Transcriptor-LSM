export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { audioBase64, language } = req.body;
    
    if (!audioBase64) {
        return res.status(400).json({ error: 'No audio provided' });
    }

    try {
        const buffer = Buffer.from(audioBase64, 'base64');
        const blob = new Blob([buffer], { type: 'audio/webm' });

        const formData = new FormData();
        formData.append('file', blob, 'grabacion.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', language || 'es');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Error from OpenAI API');
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Transcribe error:', error);
        return res.status(500).json({ error: error.message });
    }
}
