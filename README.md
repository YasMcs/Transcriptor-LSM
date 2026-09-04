# Transcriptor LSM

Herramienta de transcripción en tiempo real para clases en **Lengua de Señas Mexicana (LSM)**, impulsada por **OpenAI Whisper** y **GPT-4o-mini**.

## Características

- 🎙️ **Transcripción continua** — graba en bucles de 30 segundos sin límite de duración (ideal para clases).
- 🌐 **Soporte bilingüe** — Español e Inglés. La clase en inglés se traduce y simplifica automáticamente.
- 🤟 **Glosa LSM** — convierte el texto a la estructura: Tiempo + Lugar + Sujeto + Objeto + Verbo.
- ➕ **Fórmulas matemáticas** — detecta expresiones habladas y las convierte a símbolos reales (ej. x², √9).
- 🚫 **Moderación** — censura automática de palabras obscenas.

## Estructura del proyecto

```
whisper-app/
├── index.html         # Interfaz de usuario
├── style.css          # Estilos
├── app.js             # Lógica del frontend
└── api/
    ├── transcribe.js  # Serverless Function: Whisper
    └── process.js     # Serverless Function: GPT-4o-mini
```

## Despliegue en Vercel

1. Importa este repositorio en [vercel.com](https://vercel.com).
2. En **Settings > Environment Variables**, crea la variable:
   - `OPENAI_API_KEY` = tu clave `sk-proj-...`
3. Haz **Redeploy**. ¡Listo!

## Desarrollo local

```bash
npm i -g vercel
vercel dev
```
