'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const CLASS_ID = 'clase-123';

export function useRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Listo para grabar');

  // Refs para evitar closures stale en callbacks asíncronos
  const isRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const currentSegmentIdRef = useRef(0);
  const pendingRequestsRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);

  // Mantener el ref sincronizado con el state
  const setRecording = (value: boolean) => {
    isRecordingRef.current = value;
    setIsRecording(value);
  };

  // Inicializar WebSocket
  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket conectado al backend');
      socket.emit('join_class', { classId: CLASS_ID, role: 'maestro' });
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Error de conexión socket:', err.message);
    });

    return () => {
      socket.emit('leave_class', CLASS_ID);
      socket.disconnect();
    };
  }, []);

  const getSupportedMimeType = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  };

  const processWithAI = async (text: string, lang: string, segmentId: number) => {
    if (!text || text.length < 3) return;
    try {
      console.log(`📤 Enviando a /api/process: "${text}"`);
      const response = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });
      if (!response.ok) throw new Error(`Error en /api/process: ${response.status}`);
      const data = await response.json();
      console.log(`✅ LSM recibido (segmento ${segmentId}):`, data.lsm);

      if (socketRef.current) {
        socketRef.current.emit('send_transcription', {
          classId: CLASS_ID,
          data: { lsm: data.lsm },
        });
        console.log('📡 send_transcription emitido');
      }
    } catch (error) {
      console.error('Error procesando con IA:', error);
    }
  };

  const sendToWhisper = async (audioBlob: Blob, segmentId: number) => {
    pendingRequestsRef.current++;
    try {
      const mimeType = audioBlob.type || 'audio/webm';
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';

      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      console.log(`📤 Enviando audio a /api/transcribe (segmento ${segmentId}, ${audioBlob.size} bytes)`);
      const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, language: 'es', mimeType, ext }),
      });

      if (!response.ok) throw new Error(`Error en /api/transcribe: ${response.status}`);

      const data = await response.json();
      const whisperText = data.text?.trim();

      if (whisperText) {
        console.log(`🎙️ Whisper transcribió (segmento ${segmentId}): "${whisperText}"`);
        await processWithAI(whisperText, 'es', segmentId);
      }
    } catch (error) {
      console.error('Error Whisper:', error);
    } finally {
      pendingRequestsRef.current--;
      checkIfFinished();
    }
  };

  const checkIfFinished = () => {
    if (!isRecordingRef.current && pendingRequestsRef.current === 0) {
      setStatus('✅ Clase finalizada y procesada.');
    }
  };

  // Usa isRecordingRef (no el state) para evitar closures stale
  const iniciarGrabacionDeSegmento = (id: number): MediaRecorder | null => {
    if (!streamRef.current || !isRecordingRef.current) return null;

    const localChunks: BlobPart[] = [];
    const mimeType = getSupportedMimeType();
    const localRecorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});

    localRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) localChunks.push(e.data);
    };

    localRecorder.onstop = () => {
      const blob = new Blob(localChunks, { type: localRecorder.mimeType || 'audio/webm' });
      if (blob.size >= 1000) {
        sendToWhisper(blob, id);
      } else {
        console.log(`Segmento ${id} demasiado corto (${blob.size} bytes), descartando.`);
      }
      if (!isRecordingRef.current) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        try { recognitionRef.current?.stop(); } catch (_) {}
        checkIfFinished();
      }
    };

    localRecorder.start();

    // Cortar cada 6 segundos — usa isRecordingRef para no tener closure stale
    setTimeout(() => {
      if (isRecordingRef.current && localRecorder.state === 'recording') {
        localRecorder.stop();
        currentSegmentIdRef.current++;
        recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
      }
    }, 6000);

    return localRecorder;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setRecording(true); // actualiza ref Y state
      setStatus('🔴 Grabando clase en vivo...');
      currentSegmentIdRef.current = 0;
      pendingRequestsRef.current = 0;

      if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-MX';

        recognition.onresult = (event: any) => {
          let finalSegment = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalSegment += event.results[i][0].transcript;
          }
          if (finalSegment.trim()) {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
            currentSegmentIdRef.current++;
            recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
          }
        };

        recognition.onerror = () => {
          if (isRecordingRef.current) setTimeout(() => { try { recognition.start(); } catch (_) {} }, 1000);
        };
        recognition.onend = () => {
          if (isRecordingRef.current) { try { recognition.start(); } catch (_) {} }
        };

        try { recognition.start(); recognitionRef.current = recognition; } catch (_) {}
      }

      recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      setStatus('❌ Error: No se pudo acceder al micrófono.');
    }
  };

  const stopRecording = () => {
    setRecording(false); // actualiza ref Y state
    setStatus('⏳ Procesando últimos segmentos...');
    if (recorderRef.current?.state !== 'inactive') {
      recorderRef.current?.stop();
    } else {
      streamRef.current?.getTracks().forEach(t => t.stop());
      try { recognitionRef.current?.stop(); } catch (_) {}
      checkIfFinished();
    }
  };

  return { isRecording, status, startRecording, stopRecording };
}
