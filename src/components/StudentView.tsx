'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const CLASS_ID = 'clase-123';

interface TranscriptionSegment {
  id: number;
  lsm: string;
}

export default function StudentView() {
  const [connected, setConnected] = useState(false);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('join_class', {
        classId: CLASS_ID,
        role: 'alumno',
      });
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    newSocket.on('receive_transcription', (data: { lsm: string }) => {
      if (!data?.lsm) return;
      setSegments((prev) => [
        ...prev,
        { id: Date.now(), lsm: data.lsm },
      ]);
    });

    return () => {
      newSocket.emit('leave_class', CLASS_ID);
      newSocket.disconnect();
    };
  }, []);

  const clearSegments = () => setSegments([]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            {/* Ícono manos/señas */}
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1a4 4 0 0 1 4 4v4.268A3.99 3.99 0 0 1 18 13a3.99 3.99 0 0 1-2 3.465V19a3 3 0 0 1-6 0v-.535A3.99 3.99 0 0 1 8 15a3.97 3.97 0 0 1 .685-2.23A3.99 3.99 0 0 1 8 11a4.002 4.002 0 0 1 .268-1.432A4 4 0 0 1 8 8.268V5a4 4 0 0 1 4-4z"/>
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">Transcriptor LSM</h1>
            <p className="text-slate-400 text-xs">Vista del Estudiante</p>
          </div>
        </div>

        {/* Estado de conexión */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          connected
            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
            : 'bg-red-950/60 text-red-400 border-red-800'
        }`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'Conectado a la clase' : 'Sin conexión'}
        </div>
      </header>

      {/* Cuerpo */}
      <main className="flex-1 flex flex-col items-center px-4 py-8 max-w-3xl mx-auto w-full">

        {segments.length === 0 ? (
          /* Estado vacío — esperando al docente */
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 min-h-[60vh]">
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
                La transcripción en Lengua de Señas Mexicana aparecerá aquí cuando el docente inicie la clase.
              </p>
            </div>
          </div>

        ) : (
          /* Tarjetas de segmentos transcritos */
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-400 text-sm">{segments.length} segmento{segments.length !== 1 ? 's' : ''} recibido{segments.length !== 1 ? 's' : ''}</p>
              <button
                onClick={clearSegments}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Limpiar
              </button>
            </div>

            {segments.map((seg, index) => (
              <div
                key={seg.id}
                className="group relative bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 
                           hover:border-blue-700/50 hover:bg-slate-800 transition-all duration-300
                           animate-in slide-in-from-bottom-3"
              >
                {/* Número de segmento */}
                <span className="absolute top-4 right-4 text-slate-600 text-xs font-mono">
                  #{index + 1}
                </span>
                {/* Label */}
                <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-2">
                  LSM · Segmento
                </p>
                {/* Texto en glosa LSM */}
                <p className="text-white text-xl font-semibold leading-relaxed tracking-wide capitalize">
                  {seg.lsm}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-3 px-6 text-center">
        <p className="text-slate-600 text-xs">Transcriptor LSM · Clase <span className="font-mono text-slate-500">{CLASS_ID}</span></p>
      </footer>
    </div>
  );
}
