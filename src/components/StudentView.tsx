'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const CLASS_ID = 'clase-123';

export default function StudentView() {
  const [connected, setConnected] = useState(false);
  const [lsmTranscript, setLsmTranscript] = useState<string>('');
  const [originalTranscript, setOriginalTranscript] = useState<string>('');
  const [activeMode, setActiveMode] = useState<'lsm' | 'original'>('lsm');
  const [classStarted, setClassStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentText = activeMode === 'lsm' ? lsmTranscript : originalTranscript;

  // Auto-scroll al fondo cada vez que cambia el texto o el modo activo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lsmTranscript, originalTranscript, activeMode]);

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_class', { classId: CLASS_ID, role: 'alumno' });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('receive_transcription', (data: { text?: string, fullTranscription?: string, lsm?: string, fullLsm?: string }) => {
      setClassStarted(true);

      // Actualizar Gramática LSM en tiempo real
      if (data.fullLsm !== undefined && data.fullLsm !== null) {
        setLsmTranscript(data.fullLsm);
      } else if (data.lsm) {
        setLsmTranscript(prev => (prev ? `${prev}\n\n${data.lsm}` : data.lsm!));
      }

      // Actualizar Transcripción Original en tiempo real
      if (data.fullTranscription !== undefined && data.fullTranscription !== null) {
        setOriginalTranscript(data.fullTranscription);
      } else if (data.text) {
        setOriginalTranscript(prev => (prev ? `${prev}\n\n${data.text}` : data.text!));
      }
    });

    return () => {
      socket.emit('leave_class', CLASS_ID);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1a4 4 0 0 1 4 4v4.268A3.99 3.99 0 0 1 18 13a3.99 3.99 0 0 1-2 3.465V19a3 3 0 0 1-6 0v-.535A3.99 3.99 0 0 1 8 15a3.97 3.97 0 0 1 .685-2.23A3.99 3.99 0 0 1 8 11a4.002 4.002 0 0 1 .268-1.432A4 4 0 0 1 8 8.268V5a4 4 0 0 1 4-4z"/>
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">Transcriptor LSM</h1>
            <p className="text-slate-400 text-xs">Vista del Estudiante</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Botón limpiar */}
          {classStarted && (
            <button
              onClick={() => { setLsmTranscript(''); setOriginalTranscript(''); setClassStarted(false); }}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Limpiar
            </button>
          )}

          {/* Estado conexión */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            connected
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
              : 'bg-red-950/60 text-red-400 border-red-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'Conectado' : 'Sin conexión'}
          </div>
        </div>
      </header>

      {/* Cuerpo */}
      <main className="flex-1 flex flex-col overflow-hidden px-4 py-6 max-w-3xl mx-auto w-full">

        {!classStarted ? (
          /* Estado vacío */
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-blue-600/20 animate-ping" />
              <div className="relative bg-slate-800 border border-slate-700 p-8 rounded-full">
                <svg className="w-14 h-14 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-200">Esperando al docente...</h2>
              <p className="text-slate-500 text-sm max-w-xs">
                La transcripción en Lengua de Señas Mexicana o el texto original aparecerán aquí cuando el docente inicie la clase.
              </p>
            </div>
          </div>

        ) : (
          /* Contenedor unificado de transcripción con selector de modo */
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">

            {/* Selector de Modo (Tabs para el Alumno) */}
            <div className="flex items-center justify-between flex-shrink-0 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1 w-full sm:w-auto">
                <button
                  onClick={() => setActiveMode('lsm')}
                  className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    activeMode === 'lsm'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'lsm' ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
                  Gramática LSM
                </button>

                <button
                  onClick={() => setActiveMode('original')}
                  className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    activeMode === 'original'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'original' ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
                  Transcripción Original
                </button>
              </div>

              {/* Indicador de estado en vivo */}
              <div className="hidden sm:flex items-center gap-2 px-3 text-xs text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                EN VIVO
              </div>
            </div>

            {/* Sub-label descriptivo según modo */}
            <div className="flex items-center justify-between px-1 flex-shrink-0 text-xs text-slate-400">
              <p className="font-medium">
                {activeMode === 'lsm' ? 'Estructura LSM: Tiempo · Lugar · Sujeto · Objeto · Verbo' : 'Texto dictado por el docente'}
              </p>
            </div>

            {/* Caja de texto unificada con scroll */}
            <div
              ref={scrollRef}
              className="
                flex-1 overflow-y-auto rounded-2xl
                bg-slate-800/50 border border-slate-700/60
                p-6 leading-relaxed
                scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent
              "
              style={{ scrollBehavior: 'smooth' }}
            >
              {currentText ? (
                currentText.split('\n').map((line, i) => (
                  <span key={i}>
                    <span
                      className={`text-xl font-semibold ${activeMode === 'lsm' ? 'text-white capitalize' : 'text-slate-100'}`}
                      style={{
                        animation: 'fadeIn 0.3s ease forwards',
                      }}
                    >
                      {line}
                    </span>
                    {i < currentText.split('\n').length - 1 && (
                      <span className="text-slate-500 mx-2">·</span>
                    )}
                  </span>
                ))
              ) : (
                <p className="text-slate-500 italic text-sm">Escuchando clase...</p>
              )}
              {/* Cursor parpadeante al final */}
              <span className="inline-block w-0.5 h-5 bg-blue-400 ml-1 animate-pulse align-middle" />
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-3 px-6 text-center flex-shrink-0">
        <p className="text-slate-600 text-xs">
          Transcriptor LSM · Clase <span className="font-mono text-slate-500">{CLASS_ID}</span>
        </p>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
