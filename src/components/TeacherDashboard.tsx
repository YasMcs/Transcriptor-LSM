'use client';

import { useRecorder } from '@/hooks/useRecorder';

export default function TeacherDashboard() {
  const { isRecording, status, startRecording, stopRecording } = useRecorder();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="text-center space-y-8">
        
        {/* Encabezado */}
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Panel de Docente
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Controla la transcripción de la clase. El audio se procesará automáticamente a Lengua de Señas Mexicana y se enviará en tiempo real a los alumnos.
          </p>
        </div>

        {/* Indicador de Estado */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-colors ${
          isRecording 
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800' 
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
        }`}>
          {isRecording && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
          {status}
        </div>

        {/* Botones de Acción */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={startRecording}
            disabled={isRecording}
            className={`
              relative group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300
              ${isRecording 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-1'
              }
            `}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Iniciar Clase
          </button>

          <button
            onClick={stopRecording}
            disabled={!isRecording}
            className={`
              flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300
              ${!isRecording 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600' 
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/30 hover:shadow-slate-900/50 hover:-translate-y-1 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900'
              }
            `}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            Finalizar Clase
          </button>
        </div>

      </div>
    </div>
  );
}
