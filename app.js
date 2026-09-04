let mediaRecorder;
let audioChunks = [];
let stream;
let isRecordingLoop = false;
let pendingWhisperRequests = 0;

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
    if (recognition && isRecordingLoop) {
        recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
    }
});

// ─── SpeechRecognition: muestra texto en TIEMPO REAL mientras se graba ──────────
let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            interim += event.results[i][0].transcript;
        }
        currentInterim = interim;
        // Mostrar en pantalla lo que se dice AHORA (texto provisional + confirmado por Whisper)
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
    };

    recognition.onerror = (e) => {
        // Ignorar errores no-speech (silencio), reiniciar en errores recuperables
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
            console.warn('SpeechRecognition error:', e.error);
        }
    };

    recognition.onend = () => {
        // Si todavía estamos grabando, reiniciar automáticamente (Chrome lo detiene después de silencio)
        if (isRecordingLoop) {
            try { recognition.start(); } catch (e) { }
        }
    };
}

// ─── BOTÓN GRABAR ────────────────────────────────────────────────────────────────
recordBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecordingLoop = true;
        pendingWhisperRequests = 0;

        // Limpiar todo
        accumulatedOriginal = "";
        accumulatedTranslation = "";
        accumulatedSimplified = "";
        currentInterim = "";
        transcriptionOutput.value = "";
        translationOutput.value = "";
        simplifiedOutput.value = "";

        recordBtn.disabled = true;
        stopBtn.disabled = false;
        statusText.textContent = '🔴 Grabando... (El texto aparecerá aquí en tiempo real)';
        statusText.className = 'status recording';

        // ✅ FIX: Iniciar recognition correctamente al comenzar la grabación
        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
            try { recognition.start(); } catch (e) { }
        }

        startChunk();

    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
        statusText.textContent = 'Error: No se pudo acceder al micrófono.';
        statusText.className = 'status error';
    }
});

// ─── LOOP DE CHUNKS para Whisper (cada 8 segundos) ──────────────────────────────
function startChunk() {
    if (!isRecordingLoop) return;

    // ✅ FIX: NO reiniciamos recognition aquí, lo dejamos correr de manera continua
    // Solo reiniciamos el MediaRecorder para tomar fragmentos de audio para Whisper

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            // Enviar a Whisper sin esperar (no bloqueante), para no perder el siguiente chunk
            sendToWhisper(audioBlob, languageSelect.value);
        }

        if (isRecordingLoop) {
            startChunk(); // Continuar con el siguiente fragmento
        } else {
            stream.getTracks().forEach(track => track.stop());
            if (recognition) { try { recognition.stop(); } catch (e) { } }
            checkIfFinished();
        }
    };

    mediaRecorder.start();

    // Cortar cada 8 segundos y enviarlo a Whisper
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }, 8000);
}

// ─── BOTÓN DETENER ────────────────────────────────────────────────────────────────
stopBtn.addEventListener('click', () => {
    isRecordingLoop = false;
    stopBtn.disabled = true;
    statusText.textContent = '⏳ Procesando el último fragmento con Whisper...';
    statusText.className = 'status recording';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    } else {
        stream?.getTracks().forEach(track => track.stop());
        if (recognition) { try { recognition.stop(); } catch (e) { } }
        checkIfFinished();
    }
});

function checkIfFinished() {
    if (!isRecordingLoop && pendingWhisperRequests === 0) {
        statusText.textContent = '✅ Clase finalizada. Todo fue guardado exitosamente.';
        statusText.className = 'status success';
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        currentInterim = "";
    }
}

// ─── HELPER: Blob → Base64 ────────────────────────────────────────────────────
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ─── WHISPER: Transcripción precisa (llega ~8s después de grabarlo) ───────────
const WHISPER_HALLUCINATIONS = [
    'amara.org', 'subtítulos realizados', 'subtitulado por',
    'subtítulos por', 'transcripción por', 'comunidad de amara',
    'traducido por', 'www.', '.com', '.net', '.org'
];

async function sendToWhisper(audioBlob, lang) {
    pendingWhisperRequests++;
    try {
        const audioBase64 = await blobToBase64(audioBlob);

        const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, language: lang })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error || `HTTP ${response.status}`;
            // Mostrar el error REAL en pantalla para que sea visible
            console.error("Whisper error:", errMsg);
            statusText.textContent = `⚠️ Error Whisper: ${errMsg}`;
            statusText.className = 'status error';
            return;
        }

        const data = await response.json();
        let normalText = data.text?.trim();
        if (!normalText) return;

        // Filtrar alucinaciones conocidas de Whisper (texto basura en silencio)
        const lowerText = normalText.toLowerCase();
        const isHallucination = WHISPER_HALLUCINATIONS.some(h => lowerText.includes(h));
        if (isHallucination) {
            console.log("Alucinación de Whisper filtrada:", normalText);
            return;
        }

        // Acumular texto confirmado por Whisper (alta precisión)
        accumulatedOriginal += normalText + " ";
        // El texto en pantalla = lo que Whisper confirmó + lo que SpeechRecognition ve AHORA
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;

        await processWithAI(normalText, lang);

    } catch (error) {
        console.error("Error al transcribir fragmento (Whisper):", error);
        statusText.textContent = '⚠️ Error de red al conectar con la API';
        statusText.className = 'status error';
    } finally {
        pendingWhisperRequests--;
        checkIfFinished();
    }
}

// ─── PROCESAR CON IA (simplificación LSM / traducción) ───────────────────────
async function processWithAI(text, lang) {
    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error("Error en /api/process:", errData.error || `HTTP ${response.status}`);
            return;
        }

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
