let mediaRecorder;
let stream;
let isRecording = false;
let pendingWhisperRequests = 0;

// Acumuladores de texto para mantener el historial de la sesión
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

// ─── Vista por idioma ─────────────────────────────────────────────────────────
languageSelect.addEventListener('change', () => {
    if (languageSelect.value === 'en') {
        containerTranslation.style.display = 'block';
        labelTranscription.textContent = 'Texto Original (Inglés)';
    } else {
        containerTranslation.style.display = 'none';
        labelTranscription.textContent = 'Texto Original (Español)';
    }
});

// ─── SpeechRecognition: texto instantáneo mientras se habla ──────────────────
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
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
    };

    recognition.onerror = (e) => {
        // En error de red, reintentar automáticamente
        if (e.error === 'network' && isRecording) {
            setTimeout(() => {
                try { recognition.start(); } catch (_) { }
            }, 1000);
        }
    };

    recognition.onend = () => {
        if (isRecording) {
            try { recognition.start(); } catch (_) { }
        }
    };
}

// ─── BOTÓN GRABAR ─────────────────────────────────────────────────────────────
recordBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isRecording = true;
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
        statusText.textContent = '🔴 Grabando... (texto aparecerá cada ~8 segundos vía Whisper)';
        statusText.className = 'status recording';

        // Iniciar reconocimiento de voz en tiempo real
        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
            try { recognition.start(); } catch (_) { }
        }

        // ── MediaRecorder CONTINUO con timeslice de 8s ──────────────────────
        // ondataavailable se dispara cada 8 segundos automáticamente.
        // NO hay stop/restart — el recorder corre de forma continua.
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = async (event) => {
            if (!event.data || event.data.size === 0) return;

            const blob = event.data;
            console.log(`Chunk recibido: ${blob.size} bytes`);

            // Mínimo ~5KB (evita chunks vacíos o de ruido puro)
            if (blob.size < 5000) {
                console.log('Chunk muy pequeño, ignorado.');
                return;
            }

            // Enviar a Whisper (sin await para no bloquear los siguientes chunks)
            sendToWhisper(blob, languageSelect.value);
        };

        mediaRecorder.onstop = () => {
            // Esto solo ocurre cuando el usuario presiona Detener
            stream.getTracks().forEach(t => t.stop());
            if (recognition) { try { recognition.stop(); } catch (_) { } }
            checkIfFinished();
        };

        // timeslice = 8000ms → cada 8 segundos se dispara ondataavailable
        mediaRecorder.start(8000);

    } catch (err) {
        console.error('Error al acceder al micrófono:', err);
        statusText.textContent = 'Error: No se pudo acceder al micrófono.';
        statusText.className = 'status error';
    }
});

// ─── BOTÓN DETENER ────────────────────────────────────────────────────────────
stopBtn.addEventListener('click', () => {
    isRecording = false;
    stopBtn.disabled = true;
    statusText.textContent = '⏳ Procesando último fragmento...';
    statusText.className = 'status recording';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop(); // Dispara onstop → limpia y llama checkIfFinished
    } else {
        stream?.getTracks().forEach(t => t.stop());
        if (recognition) { try { recognition.stop(); } catch (_) { } }
        checkIfFinished();
    }
});

function checkIfFinished() {
    if (!isRecording && pendingWhisperRequests === 0) {
        statusText.textContent = '✅ Clase finalizada. Todo fue guardado.';
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

// ─── WHISPER: Transcripción precisa cada ~8s ──────────────────────────────────
const WHISPER_HALLUCINATIONS = [
    'amara.org', 'subtítulos realizados', 'subtitulado por',
    'subtítulos por', 'transcripción por', 'comunidad de amara',
    'traducido por'
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
            console.error('Whisper error:', errMsg);
            statusText.textContent = `⚠️ Error Whisper: ${errMsg}`;
            statusText.className = 'status error';
            return;
        }

        const data = await response.json();
        const normalText = data.text?.trim();
        if (!normalText) return;

        // Filtrar alucinaciones de Whisper (texto basura en silencio)
        const lower = normalText.toLowerCase();
        if (WHISPER_HALLUCINATIONS.some(h => lower.includes(h))) {
            console.log('Alucinación de Whisper filtrada:', normalText);
            return;
        }

        // Acumular texto confirmado por Whisper
        accumulatedOriginal += normalText + ' ';
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;

        await processWithAI(normalText, lang);

    } catch (error) {
        console.error('Error al transcribir fragmento:', error);
        statusText.textContent = '⚠️ Error de red al conectar con la API';
        statusText.className = 'status error';
    } finally {
        pendingWhisperRequests--;
        checkIfFinished();
    }
}

// ─── PROCESAMIENTO CON IA (LSM / Traducción) ──────────────────────────────────
async function processWithAI(text, lang) {
    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('Error en /api/process:', errData.error || `HTTP ${response.status}`);
            return;
        }

        const jsonResult = await response.json();

        if (lang === 'en' && jsonResult.traduccion) {
            accumulatedTranslation += jsonResult.traduccion + '\n\n';
            translationOutput.value = accumulatedTranslation;
            translationOutput.scrollTop = translationOutput.scrollHeight;
        }

        if (jsonResult.lsm) {
            accumulatedSimplified += jsonResult.lsm + '\n\n';
            simplifiedOutput.value = accumulatedSimplified;
            simplifiedOutput.scrollTop = simplifiedOutput.scrollHeight;
        }

    } catch (error) {
        console.error('Error al procesar con IA:', error);
    }
}
