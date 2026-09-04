let mediaRecorder = null;  // Referencia al recorder actual (para el botón Detener)
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

// ─── SpeechRecognition: texto instantáneo ────────────────────────────────────
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
        if (e.error === 'network' && isRecording) {
            setTimeout(() => { try { recognition.start(); } catch (_) { } }, 1000);
        }
    };

    recognition.onend = () => {
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
        statusText.textContent = '🔴 Grabando... (texto aparecerá cada ~8s vía Whisper)';
        statusText.className = 'status recording';

        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
            try { recognition.start(); } catch (_) { }
        }

        grabarChunk(); // Iniciar el primer chunk

    } catch (err) {
        console.error('Error al acceder al micrófono:', err);
        statusText.textContent = 'Error: No se pudo acceder al micrófono.';
        statusText.className = 'status error';
    }
});

// ─── FUNCIÓN PRINCIPAL: graba un chunk de 8s y lo manda a Whisper ─────────────
//
// ✅ FIX CLAVE: usa `localRecorder` (variable LOCAL al closure) en el setTimeout.
// Así, aunque `mediaRecorder` (global) cambie en la siguiente iteración,
// el timeout siempre detiene el recorder CORRECTO.
//
function grabarChunk() {
    if (!isRecording) return;

    const localChunks = [];
    const localRecorder = new MediaRecorder(stream, {
        mimeType: getSupportedMimeType()
    });

    // Guardar referencia global SOLO para que el botón Detener pueda pararlo
    mediaRecorder = localRecorder;

    localRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) localChunks.push(e.data);
    };

    localRecorder.onstop = () => {
        // Construir el blob de este chunk (tiene su propio header WebM completo ✓)
        const blob = new Blob(localChunks, { type: localRecorder.mimeType });
        console.log(`Chunk grabado: ${blob.size} bytes (${localRecorder.mimeType})`);

        if (blob.size >= 3000) {
            sendToWhisper(blob, languageSelect.value);
        } else {
            console.log('Chunk muy pequeño (silencio?), ignorado.');
        }

        if (isRecording) {
            grabarChunk(); // ← Siguiente chunk con un nuevo localRecorder
        } else {
            // Limpieza final al detener
            stream.getTracks().forEach(t => t.stop());
            if (recognition) { try { recognition.stop(); } catch (_) { } }
            checkIfFinished();
        }
    };

    localRecorder.start(); // Cada localRecorder genera un WebM completo e independiente

    // ✅ FIX: el setTimeout usa `localRecorder`, NO `mediaRecorder` (global)
    // Esto evita que un timeout antiguo detenga un recorder nuevo por error.
    setTimeout(() => {
        if (localRecorder.state === 'recording') {
            localRecorder.stop();
        }
    }, 8000);
}

// ─── BOTÓN DETENER ────────────────────────────────────────────────────────────
stopBtn.addEventListener('click', () => {
    isRecording = false;
    stopBtn.disabled = true;
    statusText.textContent = '⏳ Procesando el último fragmento...';
    statusText.className = 'status recording';

    // Detener el recorder actual (la referencia global apunta al chunk en curso)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        // onstop verá isRecording=false y hará la limpieza final
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

// Detectar el formato de audio soportado por el navegador
function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; // El navegador elige el formato por defecto
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

// ─── WHISPER ──────────────────────────────────────────────────────────────────
const WHISPER_HALLUCINATIONS = [
    'amara.org', 'subtítulos realizados', 'subtitulado por',
    'subtítulos por', 'transcripción por', 'comunidad de amara', 'traducido por'
];

async function sendToWhisper(audioBlob, lang) {
    pendingWhisperRequests++;
    try {
        // Determinar la extensión correcta según el mimeType del blob
        const mimeType = audioBlob.type || 'audio/webm';
        const ext = mimeType.includes('ogg') ? 'ogg'
                  : mimeType.includes('mp4') ? 'mp4'
                  : 'webm';

        const audioBase64 = await blobToBase64(audioBlob);

        const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, language: lang, mimeType, ext })
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

        const lower = normalText.toLowerCase();
        if (WHISPER_HALLUCINATIONS.some(h => lower.includes(h))) {
            console.log('Alucinación de Whisper filtrada:', normalText);
            return;
        }

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

// ─── PROCESAMIENTO CON IA ─────────────────────────────────────────────────────
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
