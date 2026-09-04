let stream;
let isRecording = false;
let pendingWhisperRequests = 0;

// Sistema basado en segmentos
let segments = [];
let currentSegmentId = 0;
let currentInterim = "";

// Elementos del DOM
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('status');
const languageSelect = document.getElementById('languageSelect');
const transcriptionOutput = document.getElementById('transcription');
const translationOutput = document.getElementById('translationText');
const simplifiedOutput = document.getElementById('simplifiedText');
const containerTranslation = document.getElementById('container-translation');
const labelTranscription = document.getElementById('label-transcription');

// Vista por idioma
languageSelect.addEventListener('change', () => {
    if (languageSelect.value === 'en') {
        containerTranslation.style.display = 'block';
        labelTranscription.textContent = 'Texto Original (Inglés)';
    } else {
        containerTranslation.style.display = 'none';
        labelTranscription.textContent = 'Texto Original (Español)';
    }
});

// Función para renderizar el texto en pantalla desde el array de segmentos
function renderText() {
    let textOriginal = "";
    let textTranslation = "";
    let textLsm = "";

    for (let seg of segments) {
        if (!seg) continue;
        if (seg.text) textOriginal += seg.text + "\n\n";
        if (seg.translation) textTranslation += seg.translation + "\n\n";
        if (seg.lsm) textLsm += seg.lsm + "\n\n";
    }

    if (currentInterim) {
        textOriginal += currentInterim;
    }

    transcriptionOutput.value = textOriginal.trim();
    translationOutput.value = textTranslation.trim();
    simplifiedOutput.value = textLsm.trim();

    transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
    translationOutput.scrollTop = translationOutput.scrollHeight;
    simplifiedOutput.scrollTop = simplifiedOutput.scrollHeight;
}

// ─── SpeechRecognition ────────────────────────────────────────────────────────
let recognition;
let activeRecorder = null; // Referencia al recorder de audio actual

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

        // Si se confirmó el final de una oración
        if (finalSegment.trim()) {
            // Guardar texto en el segmento actual (dictado rápido)
            if (!segments[currentSegmentId]) {
                segments[currentSegmentId] = { id: currentSegmentId, text: '', lsm: '', translation: '' };
            }
            segments[currentSegmentId].text = finalSegment.trim();
            
            // Detener el recorder actual para que procese a Whisper ESTA oración
            if (activeRecorder && activeRecorder.state === 'recording') {
                activeRecorder.stop();
            }

            // Iniciar nuevo segmento para la siguiente oración
            currentSegmentId++;
            if (isRecording) {
                activeRecorder = iniciarGrabacionDeSegmento(currentSegmentId);
            }
            currentInterim = '';
        } else {
            currentInterim = interim;
        }

        renderText();
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

        segments = [];
        currentSegmentId = 0;
        currentInterim = "";
        renderText();

        recordBtn.disabled = true;
        stopBtn.disabled = false;
        statusText.textContent = '🔴 Grabando... (transcribiendo en tiempo real)';
        statusText.className = 'status recording';

        if (recognition) {
            recognition.lang = languageSelect.value === 'en' ? 'en-US' : 'es-MX';
            try { recognition.start(); } catch (_) { }
        }

        // Iniciar grabador para el primer segmento
        activeRecorder = iniciarGrabacionDeSegmento(currentSegmentId);

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
    statusText.textContent = '⏳ Finalizando...';
    statusText.className = 'status recording';

    if (activeRecorder && activeRecorder.state !== 'inactive') {
        activeRecorder.stop();
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
        renderText();
    }
}

// ─── LÓGICA DE GRABACIÓN POR SEGMENTO ─────────────────────────────────────────
function getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function iniciarGrabacionDeSegmento(id) {
    if (!isRecording) return null;
    
    if (!segments[id]) {
        segments[id] = { id: id, text: '', lsm: '', translation: '' };
    }

    const localChunks = [];
    const mimeType = getSupportedMimeType();
    const localRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    localRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) localChunks.push(e.data);
    };

    localRecorder.onstop = () => {
        const blob = new Blob(localChunks, { type: localRecorder.mimeType || 'audio/webm' });
        
        // Evitar procesar fragmentos vacíos o demasiado cortos (silencio)
        if (blob.size >= 1000) {
            sendToWhisper(blob, languageSelect.value, id);
        } else {
            // Si el audio es silencio, usamos el texto dictado (si lo hay) para GPT directamente
            if (segments[id].text) {
                processWithAI(segments[id].text, languageSelect.value, id);
            }
        }

        // Si se detuvo la grabación general
        if (!isRecording) {
            stream.getTracks().forEach(t => t.stop());
            if (recognition) { try { recognition.stop(); } catch (_) { } }
            checkIfFinished();
        }
    };

    localRecorder.start();

    // Fuerza de seguridad: si pasaron 10 segundos y no hay pausa, 
    // cortamos a la fuerza para que Whisper no se atrase demasiado.
    setTimeout(() => {
        if (isRecording && localRecorder.state === 'recording') {
            // Si SR todavía está recibiendo texto, guardamos el interim actual en el segmento
            if (currentInterim && !segments[id].text) {
                 segments[id].text = currentInterim.trim();
                 currentInterim = '';
            }
            localRecorder.stop();
            // Creamos un nuevo segmento
            currentSegmentId++;
            activeRecorder = iniciarGrabacionDeSegmento(currentSegmentId);
            renderText();
        }
    }, 10000);

    return localRecorder;
}

// ─── WHISPER: Corrección Ortográfica en Retrospectiva ─────────────────────────
const WHISPER_HALLUCINATIONS = [
    'amara.org', 'subtítulos realizados', 'subtitulado por',
    'subtítulos por', 'transcripción por', 'comunidad de amara', 'traducido por'
];

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function sendToWhisper(audioBlob, lang, segmentId) {
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

        if (!response.ok) throw new Error('Error Whisper');

        const data = await response.json();
        const whisperText = data.text?.trim();

        if (whisperText) {
            const lower = whisperText.toLowerCase();
            if (!WHISPER_HALLUCINATIONS.some(h => lower.includes(h))) {
                // Actualizar el texto del segmento con la versión corregida por Whisper
                segments[segmentId].text = whisperText;
                renderText();
                console.log(`Whisper corrigió segmento ${segmentId}:`, whisperText);
                
                // Enviar la versión PERFECTA de Whisper a GPT
                await processWithAI(whisperText, lang, segmentId);
                return;
            }
        }
        
        // Fallback: Si Whisper falló o es alucinación, mandamos el texto de SR a GPT
        if (segments[segmentId].text) {
             await processWithAI(segments[segmentId].text, lang, segmentId);
        }

    } catch (error) {
        console.error('Error Whisper:', error);
        if (segments[segmentId].text) {
             await processWithAI(segments[segmentId].text, lang, segmentId);
        }
    } finally {
        pendingWhisperRequests--;
        checkIfFinished();
    }
}

// ─── GPT: Procesamiento LSM y Traducción ──────────────────────────────────────
async function processWithAI(text, lang, segmentId) {
    if (!text || text.length < 3) return;
    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang })
        });

        if (!response.ok) throw new Error('Error GPT');

        const jsonResult = await response.json();

        if (lang === 'en' && jsonResult.traduccion) {
            segments[segmentId].translation = jsonResult.traduccion;
        }

        if (jsonResult.lsm) {
            segments[segmentId].lsm = jsonResult.lsm.toLowerCase();
        }

        renderText();
    } catch (error) {
        console.error('Error al procesar con IA:', error);
    }
}
