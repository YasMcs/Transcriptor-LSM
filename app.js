let mediaRecorder = null;
let stream;
let isRecording = false;
let pendingWhisperRequests = 0;

// Acumuladores de texto
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

// ─── SpeechRecognition ────────────────────────────────────────────────────────
// Es la FUENTE PRINCIPAL de transcripción en tiempo real.
// - Resultados INTERIM → se muestran al instante en pantalla (texto provisional)
// - Resultados FINAL   → se acumulan como texto permanente + disparan IA
// Whisper corre en paralelo para mayor precisión pero NO bloquea la pantalla.
let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interim = '';
        let finalSegment = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalSegment += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        // Texto final confirmado → acumular y disparar IA INMEDIATAMENTE
        if (finalSegment.trim()) {
            accumulatedOriginal += finalSegment + ' ';
            currentInterim = '';
            // IA casi instantánea (no espera Whisper)
            processWithAI(finalSegment.trim(), languageSelect.value);
        }

        // Provisional → solo visual
        currentInterim = interim;
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
    };

    recognition.onerror = (e) => {
        if (e.error === 'network' && isRecording) {
            // Reintentar en 1 segundo si hay error de red
            setTimeout(() => { try { recognition.start(); } catch (_) { } }, 1000);
        }
    };

    recognition.onend = () => {
        // Chrome detiene el recognition después de silencio — reiniciarlo si seguimos grabando
        if (isRecording) { try { recognition.start(); } catch (_) { } }
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
        statusText.textContent = '🔴 Grabando... (transcribiendo en tiempo real)';
        statusText.className = 'status recording';

        // Iniciar reconocimiento de voz EN TIEMPO REAL
        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
            try { recognition.start(); } catch (_) { }
        }

        // Iniciar Whisper en paralelo (mejora la precisión en background)
        grabarChunk();

    } catch (err) {
        console.error('Error al acceder al micrófono:', err);
        statusText.textContent = 'Error: No se pudo acceder al micrófono.';
        statusText.className = 'status error';
    }
});

// ─── WHISPER en background: mejora precisión cada 8s ─────────────────────────
// Usa variable LOCAL (localRecorder) en el closure del setTimeout para evitar
// el bug donde el timeout detenía el recorder equivocado.
function grabarChunk() {
    if (!isRecording) return;

    const localChunks = [];
    const mimeType = getSupportedMimeType();
    const localRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecorder = localRecorder; // Referencia global solo para botón Detener

    localRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) localChunks.push(e.data);
    };

    localRecorder.onstop = () => {
        const blob = new Blob(localChunks, { type: localRecorder.mimeType || 'audio/webm' });
        console.log(`Whisper chunk: ${blob.size} bytes`);

        if (blob.size >= 1000) {
            sendToWhisper(blob, languageSelect.value);
        }

        if (isRecording) {
            grabarChunk(); // Siguiente chunk
        } else {
            stream.getTracks().forEach(t => t.stop());
            if (recognition) { try { recognition.stop(); } catch (_) { } }
            checkIfFinished();
        }
    };

    localRecorder.start();

    // 4 segundos para Whisper (balance ideal entre tiempo real y estabilidad de chunk)
    setTimeout(() => {
        if (localRecorder.state === 'recording') localRecorder.stop();
    }, 4000);
}

// ─── BOTÓN DETENER ────────────────────────────────────────────────────────────
stopBtn.addEventListener('click', () => {
    isRecording = false;
    stopBtn.disabled = true;
    statusText.textContent = '⏳ Finalizando...';
    statusText.className = 'status recording';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
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

function getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
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

// ─── WHISPER: precisión en background ────────────────────────────────────────
const WHISPER_HALLUCINATIONS = [
    'amara.org', 'subtítulos realizados', 'subtitulado por',
    'subtítulos por', 'transcripción por', 'comunidad de amara', 'traducido por'
];

async function sendToWhisper(audioBlob, lang) {
    pendingWhisperRequests++;
    try {
        const mimeType = audioBlob.type || 'audio/webm';
        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
        const audioBase64 = await blobToBase64(audioBlob);

        const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, language: lang, mimeType, ext })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('Whisper error:', errData.error || `HTTP ${response.status}`);
            return;
        }

        const data = await response.json();
        const normalText = data.text?.trim();
        if (!normalText) return;

        const lower = normalText.toLowerCase();
        if (WHISPER_HALLUCINATIONS.some(h => lower.includes(h))) return;

        // Whisper llegó: corregir el texto acumulado en pantalla
        // NO disparar processWithAI aquí — ya lo hizo SpeechRecognition finals (más rápido)
        accumulatedOriginal = accumulatedOriginal + normalText.slice(accumulatedOriginal.trimEnd().length).trimStart();
        // Simplificación: Whisper acumula por separado sin sobreescribir lo ya procesado
        transcriptionOutput.value = accumulatedOriginal + currentInterim;
        transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
        console.log('Whisper (corrección):', normalText);

        // Solo procesar con IA si SpeechRecognition no está disponible (fallback)
        if (!recognition) {
            await processWithAI(normalText, lang);
        }

    } catch (error) {
        console.error('Error Whisper:', error);
    } finally {
        pendingWhisperRequests--;
        checkIfFinished();
    }
}

// ─── PROCESAMIENTO CON IA (LSM / Traducción) ──────────────────────────────────
// Se dispara con cada oración final de SpeechRecognition → respuesta casi inmediata
async function processWithAI(text, lang) {
    if (!text || text.length < 3) return;
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
            const cleanLsm = jsonResult.lsm.toLowerCase();
            accumulatedSimplified += cleanLsm + '\n\n';
            simplifiedOutput.value = accumulatedSimplified;
            simplifiedOutput.scrollTop = simplifiedOutput.scrollHeight;
        }

    } catch (error) {
        console.error('Error al procesar con IA:', error);
    }
}
