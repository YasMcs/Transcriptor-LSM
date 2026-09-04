export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { audioBase64, language, ext } = req.body;
    
    if (!audioBase64) {
        return res.status(400).json({ error: 'No audio provided' });
    }

    // Usar la extensión enviada desde el cliente, default a 'webm'
    const fileExt = ext || 'webm';
    const fileName = `grabacion.${fileExt}`;

    try {
        const buffer = Buffer.from(audioBase64, 'base64');
        const blob = new Blob([buffer], { type: `audio/${fileExt}` });

        const formData = new FormData();
        formData.append('file', blob, fileName);

        // Si existe GROQ_API_KEY, usamos Groq con Whisper Large v3 (ultra rápido ~0.2s)
        const useGroq = Boolean(process.env.GROQ_API_KEY);
        const apiUrl = useGroq 
            ? 'https://api.groq.com/openai/v1/audio/transcriptions'
            : 'https://api.openai.com/v1/audio/transcriptions';
        const apiKey = useGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
        const model = useGroq ? 'whisper-large-v3-turbo' : 'whisper-1';

        formData.append('model', model);
        formData.append('language', language || 'es');

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || error.message || 'Error de API de transcripción');
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Transcribe error:', error);
        return res.status(500).json({ error: error.message });
    }
}

