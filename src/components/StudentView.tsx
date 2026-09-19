'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const CLASS_ID = 'clase-123';

interface SummaryData {
  titulo: string;
  puntos: string[];
  conclusion: string;
}

interface SummaryDocument {
  summary: string;
  fullTranscription: string;
  fullLsm: string;
}

async function downloadSummaryPDF(summary: SummaryData, classId: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = margin;

  // Encabezado azul
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('Transcriptor LSM — Resumen de Clase', margin, 9);
  doc.setTextColor(0, 0, 0);
  y = 24;

  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const tituloLines = doc.splitTextToSize(summary.titulo || 'Resumen de la Clase', maxW);
  doc.text(tituloLines, margin, y);
  y += tituloLines.length * 8 + 6;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Puntos
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Puntos principales', margin, y);
  y += 7;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  (summary.puntos || []).forEach((punto) => {
    const lines = doc.splitTextToSize('• ' + punto, maxW - 4);
    if (y + lines.length * 6 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines, margin + 2, y);
    y += lines.length * 6 + 2;
  });

  y += 4;

  // Conclusión
  if (summary.conclusion) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Conclusión', margin, y);
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const conclusionLines = doc.splitTextToSize(summary.conclusion, maxW);
    doc.text(conclusionLines, margin, y);
  }

  // Pie
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Generado el ' + new Date().toLocaleDateString('es-MX', { dateStyle: 'long' }) + ' — Clase ' + classId,
    margin, pageH - 10
  );

  doc.save('resumen-clase-' + classId + '.pdf');
}

export default function StudentView() {
  const [connected, setConnected] = useState(false);
  const [lsmTranscript, setLsmTranscript] = useState<string>('');
  const [originalTranscript, setOriginalTranscript] = useState<string>('');
  const [activeMode, setActiveMode] = useState<'lsm' | 'original' | 'summary'>('lsm');
  const [classStarted, setClassStarted] = useState(false);
  const [classEnded, setClassEnded] = useState(false);
  const [summaryDocument, setSummaryDocument] = useState<SummaryDocument | null>(null);
  const [parsedSummary, setParsedSummary] = useState<SummaryData | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentText = activeMode === 'lsm' ? lsmTranscript : originalTranscript;

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

    socket.on('receive_transcription', (data: {
      text?: string;
      fullTranscription?: string;
      lsm?: string;
      fullLsm?: string;
      isEnd?: boolean;
      document?: SummaryDocument;
    }) => {
      if (data.isEnd && data.document) {
        setSummaryDocument(data.document);
        try {
          const parsed: SummaryData = JSON.parse(data.document.summary);
          setParsedSummary(parsed);
        } catch {
          setParsedSummary({ titulo: 'Resumen de la Clase', puntos: [data.document.summary], conclusion: '' });
        }
        setClassEnded(true);
        setActiveMode('summary');
        return;
      }

      setClassStarted(true);

      if (data.fullLsm !== undefined && data.fullLsm !== null) {
        setLsmTranscript(data.fullLsm);
      } else if (data.lsm) {
        setLsmTranscript(prev => (prev ? prev + '\n\n' + data.lsm : data.lsm!));
      }

      if (data.fullTranscription !== undefined && data.fullTranscription !== null) {
        setOriginalTranscript(data.fullTranscription);
      } else if (data.text) {
        setOriginalTranscript(prev => (prev ? prev + '\n\n' + data.text : data.text!));
      }
    });

    return () => {
      socket.emit('leave_class', CLASS_ID);
      socket.disconnect();
    };
  }, []);

  const handleDownloadPDF = async () => {
    if (!parsedSummary) return;
    setIsGeneratingPDF(true);
    try {
      await downloadSummaryPDF(parsedSummary, CLASS_ID);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

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
          {classStarted && !classEnded && (
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
              <h2 className="text-xl font-semibold text-slate-200">La clase aún no ha iniciado</h2>
              <p className="text-slate-500 text-sm max-w-xs">
                Cuando el maestro inicie la grabación, el texto en LSM aparecerá aquí automáticamente.
              </p>
            </div>
          </div>

        ) : (
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">

            {/* Tabs */}
            <div className="flex items-center justify-between flex-shrink-0 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto">
                <button
                  onClick={() => setActiveMode('lsm')}
                  className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    activeMode === 'lsm'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'lsm' && !classEnded ? 'bg-white animate-pulse' : activeMode === 'lsm' ? 'bg-white' : 'bg-slate-500'}`} />
                  LSM — Lengua de Señas
                </button>

                <button
                  onClick={() => setActiveMode('original')}
                  className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    activeMode === 'original'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'original' && !classEnded ? 'bg-white animate-pulse' : activeMode === 'original' ? 'bg-white' : 'bg-slate-500'}`} />
                  Texto del Maestro
                </button>

                {classEnded && (
                  <button
                    onClick={() => setActiveMode('summary')}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                      activeMode === 'summary'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${activeMode === 'summary' ? 'bg-white' : 'bg-slate-500'}`} />
                    Resumen de la Clase
                  </button>
                )}
              </div>

              <div className={`hidden sm:flex items-center gap-2 px-3 text-xs font-medium ${classEnded ? 'text-slate-400' : 'text-blue-400'}`}>
                <span className={`w-2 h-2 rounded-full ${classEnded ? 'bg-slate-400' : 'bg-blue-400 animate-pulse'}`} />
                {classEnded ? 'FINALIZADO' : 'EN VIVO'}
              </div>
            </div>

            {/* Sub-label + botón PDF */}
            <div className="flex items-center justify-between px-1 flex-shrink-0 text-xs text-slate-400">
              <p className="font-medium">
                {activeMode === 'lsm' && 'Estructura: Tiempo · Lugar · Sujeto · Objeto · Verbo'}
                {activeMode === 'original' && 'Texto dictado por el maestro, sin modificaciones'}
                {activeMode === 'summary' && 'Resumen académico generado al finalizar la clase'}
              </p>
              {activeMode === 'summary' && parsedSummary && (
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                >
                  {isGeneratingPDF ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Generando...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar PDF
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Contenido */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto rounded-2xl bg-slate-800/50 border border-slate-700/60 p-6 leading-relaxed scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
              style={{ scrollBehavior: 'smooth' }}
            >
              {activeMode === 'summary' && parsedSummary ? (
                <div className="space-y-6 text-slate-200">
                  <div>
                    <h2 className="text-2xl font-bold text-white leading-tight">
                      {parsedSummary.titulo || 'Resumen de la Clase'}
                    </h2>
                    <div className="mt-2 h-0.5 w-16 bg-purple-500 rounded-full" />
                  </div>

                  {parsedSummary.puntos && parsedSummary.puntos.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-3">
                        Puntos principales
                      </h3>
                      <ul className="space-y-3">
                        {parsedSummary.puntos.map((punto, i) => (
                          <li key={i} className="flex gap-3 text-slate-200 text-base leading-relaxed">
                            <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-400" />
                            {punto}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {parsedSummary.conclusion && (
                    <div className="rounded-xl bg-slate-700/40 border border-slate-600/50 p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                        Conclusión
                      </h3>
                      <p className="text-slate-200 text-base leading-relaxed">
                        {parsedSummary.conclusion}
                      </p>
                    </div>
                  )}
                </div>

              ) : currentText ? (
                <div className="space-y-5">
                  {currentText
                    .split(/\n+/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
                    .map((paragraphText, i) => (
                      <p
                        key={i}
                        className={`text-xl font-medium leading-relaxed tracking-wide ${
                          activeMode === 'lsm' ? 'text-white capitalize' : 'text-slate-100'
                        }`}
                        style={{ animation: 'fadeIn 0.3s ease forwards' }}
                      >
                        {paragraphText}
                      </p>
                    ))}
                  {!classEnded && <span className="inline-block w-2 h-5 bg-blue-400 animate-pulse align-middle" />}
                </div>
              ) : (
                <p className="text-slate-500 italic text-sm">
                  {activeMode === 'lsm' ? 'Escuchando al maestro...' : 'Esperando texto de la clase...'}
                </p>
              )}
            </div>

          </div>
        )}
      </main>

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
