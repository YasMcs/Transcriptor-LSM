'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const CLASS_ID = 'clase-123';

export function useRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState('Listo para grabar');

  const isPausedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const currentSegmentIdRef = useRef(0);
  const pendingRequestsRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  const contextBufferRef = useRef<string[]>([]);

  const setRecording = (value: boolean) => {
    isRecordingRef.current = value;
    setIsRecording(value);
  };

  const pauseRecording = () => {
    if (!isRecordingRef.current || isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);

    // Silenciar la entrada del micrófono para que no se capture audio mientras esté en pausa
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try { recorderRef.current.pause(); } catch (_) {}
    }

    try { recognitionRef.current?.stop(); } catch (_) {}
    setStatus('⏸ Clase en pausa');
  };

  const resumeRecording = () => {
    if (!isRecordingRef.current || !isPausedRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);

    // Reactivar la entrada del micrófono
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }

    if (recorderRef.current && recorderRef.current.state === 'paused') {
      try { recorderRef.current.resume(); } catch (_) {}
    } else {
      currentSegmentIdRef.current++;
      recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
    }

    try { recognitionRef.current?.start(); } catch (_) {}
    setStatus('🔴 Grabando clase en vivo...');
  };

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

  const processWithAI = async (text: string, lang: string, segmentId: number, fullTranscription?: string) => {
    if (isPausedRef.current || !isRecordingRef.current) return;
    if (!text || text.length < 3) return;
    try {
      contextBufferRef.current = [...contextBufferRef.current, text].slice(-3);
      const context = contextBufferRef.current.slice(0, -1).join(' '); 

      console.log(`📤 Enviando a /api/process: "${text}" | Contexto: "${context}"`);
      const response = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang, context, classId: CLASS_ID }),
      });
      if (!response.ok) throw new Error(`Error en /api/process: ${response.status}`);
      const data = await response.json();
      console.log(`✅ LSM recibido (segmento ${segmentId}):`, data.lsm);

      if (socketRef.current && !isPausedRef.current) {
        socketRef.current.emit('send_transcription', {
          classId: CLASS_ID,
          data: { 
            text: text, 
            fullTranscription: fullTranscription, 
            lsm: data.lsm, 
            fullLsm: data.fullLsm 
          },
        });
        console.log('📡 send_transcription emitido');
      }
    } catch (error) {
      console.error('Error procesando con IA:', error);
    }
  };

  const sendToWhisper = async (audioBlob: Blob, segmentId: number) => {
    if (isPausedRef.current || !isRecordingRef.current) return;
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
        body: JSON.stringify({ audioBase64, language: 'es', mimeType, ext, classId: CLASS_ID }),
      });

      if (!response.ok) throw new Error(`Error en /api/transcribe: ${response.status}`);

      const data = await response.json();
      const whisperText = data.text?.trim();

      if (whisperText && !isPausedRef.current) {
        console.log(`🎙️ Whisper transcribió (segmento ${segmentId}): "${whisperText}"`);
        await processWithAI(whisperText, 'es', segmentId, data.fullTranscription);
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

  const iniciarGrabacionDeSegmento = (id: number): MediaRecorder | null => {
    if (!streamRef.current || !isRecordingRef.current || isPausedRef.current) return null;

    const mimeType = getSupportedMimeType();
    const localRecorder = new MediaRecorder(streamRef.current, { mimeType });
    const audioChunks: Blob[] = [];

    localRecorder.ondataavailable = event => {
      if (event.data.size > 0 && !isPausedRef.current) audioChunks.push(event.data);
    };

    localRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      if (!isPausedRef.current && audioBlob.size > 20000) {
        sendToWhisper(audioBlob, id);
      }
      if (!isRecordingRef.current) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        try { recognitionRef.current?.stop(); } catch (_) {}
        checkIfFinished();
      }
    };

    localRecorder.start();

    setTimeout(() => {
      if (isRecordingRef.current && !isPausedRef.current && localRecorder.state === 'recording') {
        localRecorder.stop();
        currentSegmentIdRef.current++;
        recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
      }
    }, 6000);

    return localRecorder;
  };

  const startRecording = async (topicContext: string = '') => {
    try {
      console.log('Solicitando acceso al microfono...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isPausedRef.current = false;
      setIsPaused(false);
      setRecording(true);
      setStatus('Preparando clase...');
      currentSegmentIdRef.current = 0;
      pendingRequestsRef.current = 0;

      if (topicContext) {
        try {
          await fetch(`${BACKEND_URL}/api/class/context`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId: CLASS_ID, topicContext }),
          });
          console.log('✅ Contexto de clase enviado:', topicContext);
        } catch (err) {
          console.error('Error al enviar contexto de clase:', err);
        }
      }

      if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-MX';

        recognition.onresult = (event: any) => {
          if (isPausedRef.current || !isRecordingRef.current) return;
          let finalSegment = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalSegment += event.results[i][0].transcript;
          }
          if (finalSegment.trim() && !isPausedRef.current) {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
            currentSegmentIdRef.current++;
            recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
          }
        };

        recognition.onerror = () => {
          if (isRecordingRef.current && !isPausedRef.current) setTimeout(() => { try { recognition.start(); } catch (_) {} }, 1000);
        };
        recognition.onend = () => {
          if (isRecordingRef.current && !isPausedRef.current) { try { recognition.start(); } catch (_) {} }
        };

        try { recognition.start(); recognitionRef.current = recognition; } catch (_) {}
      }

      recorderRef.current = iniciarGrabacionDeSegmento(currentSegmentIdRef.current);
      setStatus('🔴 Grabando clase en vivo...');
    } catch (error) {
      console.error('Error al acceder al microfono:', error);
      setStatus('Error: Permiso denegado');
    }
  };

  const stopRecording = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    setRecording(false);
    setStatus('⏳ Procesando últimos segmentos...');
    
    // Reactivar pistas por si estaban deshabilitadas antes de cerrar
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => t.enabled = true);
    }

    if (recorderRef.current?.state !== 'inactive') {
      recorderRef.current?.stop();
    } else {
      streamRef.current?.getTracks().forEach(t => t.stop());
      try { recognitionRef.current?.stop(); } catch (_) {}
      checkIfFinished();
    }
  };

  return { isRecording, isPaused, status, startRecording, stopRecording, pauseRecording, resumeRecording };
}
