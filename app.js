let mediaRecorder;
let audioChunks = [];
let stream;
let isRecordingLoop = false;
let pendingWhisperRequests = 0; // Para saber cuándo Whisper termina de procesar todo

// Acumuladores de texto para mantener el historial de la sesión larga
let accumulatedOriginal = "";
let accumulatedTranslation = "";
let accumulatedSimplified = "";
let currentInterim = "";

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
    
    if (recognition) {
        recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
    }
});

let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event) => {
        let interimT = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            interimT += event.results[i][0].transcript;
        }
        currentInterim = interimT;
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
    };
    
    recognition.onerror = () => {};
    
    recognition.onend = () => {
        if (isRecordingLoop) {
            try { recognition.start(); } catch(e) {}
        }
    };
}

recordBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecordingLoop = true;
        pendingWhisperRequests = 0;
        
        accumulatedOriginal = "";
        accumulatedTranslation = "";
        accumulatedSimplified = "";
        currentInterim = "";
        transcriptionOutput.value = "";
        translationOutput.value = "";
        simplifiedOutput.value = "";

        recordBtn.disabled = true;
        stopBtn.disabled = false;
        statusText.textContent = 'Clase en curso... (Grabando y procesando con Whisper en tiempo real)';
        statusText.className = 'status recording';
        
        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
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
    
    // Reiniciamos recognition para que el interim text no se acumule de fragmentos pasados
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
        setTimeout(() => {
            if (isRecordingLoop) {
                try { recognition.start(); } catch(e) {}
            }
        }, 100);
    }
    
    currentInterim = ""; // Limpiar interim de este chunk
    
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
            checkIfFinished();
        }
    };

    mediaRecorder.start();
    
    // REDUCIDO a 8 segundos para que las versiones de la IA salgan "en tiempo real"
    setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }, 8000); 
}

stopBtn.addEventListener('click', () => {
    isRecordingLoop = false;
    
    // Deshabilitamos temporalmente para evitar bugs visuales
    stopBtn.disabled = true;
    statusText.textContent = 'Procesando último fragmento con Whisper...';
    statusText.className = 'status recording';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    } else {
        checkIfFinished();
    }
});

function checkIfFinished() {
    if (!isRecordingLoop && pendingWhisperRequests === 0) {
        statusText.textContent = 'Clase finalizada. Todo fue guardado exitosamente.';
        statusText.className = 'status success';
        recordBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

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
    pendingWhisperRequests++;
    try {
        const audioBase64 = await blobToBase64(audioBlob);
        
        // Llamada al servidor Vercel local para Whisper
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
        let normalText = data.text?.trim();
        if (!normalText) return;

        accumulatedOriginal += normalText + " ";
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
        
        await processWithAI(normalText, lang);

    } catch (error) {
        console.error("Error al transcribir un fragmento (Whisper):", error);
        statusText.textContent = 'Error al conectar con la API (Revisa consola)';
        statusText.className = 'status error';
    } finally {
        pendingWhisperRequests--;
        checkIfFinished();
    }
}

async function processWithAI(text, lang) {
    try {
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

