# Guía de Despliegue para Laboratorio Torres 🚀

Esta plataforma de reporte de resultados clínicos está diseñada para funcionar de forma **híbrida y resiliente**, con soporte nativo para base de datos local cifrada y sincronización en la nube con **PostgreSQL (Supabase)**.

A continuación, se describen los pasos exactos para desplegar la aplicación en **Vercel** y **Railway**.

---

## 1. Despliegue en Railway (Recomendado para Full-Stack) 🚆

Railway es ideal para esta aplicación porque mantiene un proceso de servidor Node.js (Express) corriendo de forma continua, manejando las peticiones y sirviendo el frontend de manera integrada.

### Pasos para desplegar en Railway:

1. **Crear un nuevo proyecto en Railway**:
   - Ve a [Railway.app](https://railway.app/) e inicia sesión.
   - Haz clic en **New Project** -> **Deploy from GitHub repo**.
   - Selecciona el repositorio de tu proyecto.

2. **Configurar las Variables de Entorno en Railway**:
   Ve a la pestaña **Variables** en el panel de tu servicio en Railway y agrega:
   * `NODE_ENV` = `production`
   * `PORT` = `3000` (Railway asignará automáticamente el puerto dinámico, pero es buena práctica declararlo).
   * `DATABASE_URL` = *Su cadena de conexión de Supabase / Postgres* (ej: `postgres://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`).
   * *(Opcional)* `GEMINI_API_KEY` = *Su API Key de Google Gemini* (si planea usar funciones de Inteligencia Artificial).

3. **Compilación y Arranque Automático**:
   Railway detectará el archivo `package.json` y ejecutará de forma automática:
   - **Fase de Build**: `npm run build` (compila la SPA en React y empaqueta el servidor Express en `dist/server.cjs`).
   - **Fase de Start**: `npm run start` (inicia el servidor de producción usando `node dist/server.cjs`).

¡Listo! Railway te proporcionará un dominio público HTTPS (ej. `laboratorio-torres.up.railway.app`) listo para usar.

---

## 2. Despliegue en Vercel (Excelente opción Serverless) ⚡

Vercel es excelente para alojar la interfaz de usuario en React de manera súper rápida, y redirecciona las llamadas de la API `/api/*` hacia Serverless Functions de Node.js.

La aplicación ya cuenta con un archivo `vercel.json` y un punto de entrada `api/index.ts` listos para Vercel.

### Pasos para desplegar en Vercel:

1. **Importar el proyecto en Vercel**:
   - Ve a [Vercel.com](https://vercel.com/) e inicia sesión.
   - Haz clic en **Add New** -> **Project**.
   - Selecciona tu repositorio de GitHub.

2. **Configurar los Ajustes del Proyecto**:
   - **Framework Preset**: Selecciona **Vite** (Vercel configurará automáticamente el directorio de salida como `dist` y el comando de construcción como `npm run build`).

3. **Configurar las Variables de Entorno en Vercel**:
   En la sección de **Environment Variables**, añade:
   * `DATABASE_URL` = *Su cadena de conexión de Supabase o Postgres*.
   * *(Opcional)* `GEMINI_API_KEY` = *Su API Key de Google Gemini*.
   * *Nota*: En entornos serverless de Vercel, el almacenamiento local `/tmp` es temporal. Para asegurar que tus datos persistan permanentemente, **debes configurar `DATABASE_URL` (Supabase/Postgres)** en las variables de entorno de Vercel.

4. **Desplegar**:
   - Haz clic en **Deploy**. Vercel compilará la interfaz en React y publicará las rutas `/api/*` de forma automática.

---

## 3. Conexión de Base de Datos (Supabase / Postgres) 🗄️

Para que los resultados médicos de tus pacientes se sincronicen de forma segura entre todos los dispositivos del laboratorio, te recomendamos crear una base de datos gratuita en **Supabase**:

1. Crea un proyecto gratuito en [Supabase.com](https://supabase.com/).
2. Copia la cadena de conexión de base de datos desde **Project Settings** -> **Database** -> **Connection string** (selecciona el formato **URI**).
3. Pega esa dirección en la variable de entorno `DATABASE_URL` tanto en Railway como en Vercel.
4. **La aplicación inicializará y creará automáticamente todas las tablas requeridas** (`lab_users`, `lab_records`, `lab_profiles`) en tu primera conexión. ¡No tienes que escribir código SQL manualmente!
