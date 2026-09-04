let mediaRecorder;
let audioChunks = [];
let stream;
let isRecordingLoop = false;

// Acumuladores de texto para mantener el historial de la sesión larga
let accumulatedOriginal = "";
let accumulatedTranslation = "";
let accumulatedSimplified = "";

const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('status');

const languageSelect = document.getElementById('languageSelect');
const transcriptionOutput = document.getElementById('transcription');
const translationOutput = document.getElementById('translationText');
const simplifiedOutput = document.getElementById('simplifiedText');
const containerTranslation = document.getElementById('container-translation');
const labelTranscription = document.getElementById('label-transcription');

// Cambiar la vista dependiendo del idioma seleccionado
languageSelect.addEventListener('change', () => {
    if (languageSelect.value === 'en') {
        containerTranslation.style.display = 'block';
        labelTranscription.textContent = 'Texto Original (Inglés)';
    } else {
        containerTranslation.style.display = 'none';
        labelTranscription.textContent = 'Texto Original (Español)';
    }
    
    // Actualizar el idioma del reconocimiento en tiempo real si está activo
    if (recognition) {
        recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
    }
});

let recognition;
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-MX';
    
    recognition.onresult = (event) => {
        let interimT = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            interimT += event.results[i][0].transcript;
        }
        transcriptionOutput.value = accumulatedOriginal + interimT;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
    };
}

recordBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecordingLoop = true;
        
        accumulatedOriginal = "";
        accumulatedTranslation = "";
        accumulatedSimplified = "";
        transcriptionOutput.value = "";
        translationOutput.value = "";
        simplifiedOutput.value = "";

        recordBtn.disabled = true;
        stopBtn.disabled = false;
        statusText.textContent = 'Clase en curso... (Grabando y procesando en bucle seguro)';
        statusText.className = 'status recording';
        
        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
            try { recognition.start(); } catch(e) {}
        }

        startChunk();

    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
        statusText.textContent = 'Error: No se pudo acceder al micrófono.';
        statusText.className = 'status error';
    }
});

function startChunk() {
    if (!isRecordingLoop) return;
    
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            sendToWhisper(audioBlob, languageSelect.value);
        }
        
        if (isRecordingLoop) {
            startChunk();
        } else {
            stream.getTracks().forEach(track => track.stop());
            if (recognition) { try { recognition.stop(); } catch(e) {} }
            statusText.textContent = 'Clase finalizada. Procesando últimos fragmentos...';
            statusText.className = 'status success';
        }
    };

    mediaRecorder.start();
    
    setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }, 30000);
}

stopBtn.addEventListener('click', () => {
    isRecordingLoop = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    recordBtn.disabled = false;
    stopBtn.disabled = true;
});

// Helper para convertir Blob a Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function sendToWhisper(audioBlob, lang) {
    try {
        const audioBase64 = await blobToBase64(audioBlob);
        
        // Llamada a nuestro servidor Vercel local en lugar de OpenAI directo
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ audioBase64, language: lang })
        });

        if (!response.ok) {
            throw new Error('Error en Vercel /api/transcribe');
        }

        const data = await response.json();
        let normalText = data.text.trim();
        if (!normalText) return;

        accumulatedOriginal += normalText + "\n\n";
        transcriptionOutput.value = accumulatedOriginal;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
        
        await processWithAI(normalText, lang);

    } catch (error) {
        console.error("Error al transcribir un fragmento:", error);
    }
}

async function processWithAI(text, lang) {
    try {
        // Llamada a nuestro servidor Vercel local
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, lang })
        });

        if (!response.ok) throw new Error('Error en Vercel /api/process');

        const jsonResult = await response.json();
        
        if (lang === 'en' && jsonResult.traduccion) {
            accumulatedTranslation += jsonResult.traduccion + "\n\n";
            translationOutput.value = accumulatedTranslation;
            translationOutput.scrollTop = translationOutput.scrollHeight;
        }
        
        if (jsonResult.lsm) {
            accumulatedSimplified += jsonResult.lsm + "\n\n";
            simplifiedOutput.value = accumulatedSimplified;
            simplifiedOutput.scrollTop = simplifiedOutput.scrollHeight;
        }

    } catch (error) {
        console.error("Error al procesar con IA:", error);
    }
}
