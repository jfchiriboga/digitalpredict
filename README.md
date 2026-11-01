# Digital Predict: competencia de inversión digital

Dashboard para analizar una marca y compararla con su competencia dentro de la misma categoría. Los datos salen de la tabla `reporting01.markplan.com / infomedia_marts.mart_digital_predict_industria`, consultada en vivo con Windsor (conector `mysql`).

La versión publicada es un artefacto de Claude de tipo Dashboard: https://claude.ai/artifact/MrZjGBo8rDJqYCJmVfdVxb

## Dos versiones del mismo dashboard

- **Artefacto de claude.ai** (`dashboard/`): respaldo del código publicado. Cada lector usa su propia conexión a Windsor.
- **App para Vercel** (`public/` y `api/`): la misma página con un servidor propio que consulta Windsor con una clave. Ver *Despliegue en Vercel* más abajo.

## Qué contiene el respaldo del artefacto

| Archivo | Contenido |
|---|---|
| `dashboard/index.html` | La página: filtros, indicadores, gráficos, tabla, cálculos (`dash.calc`) y conversión de la respuesta de Windsor (`dash.loader`). |
| `dashboard/datasets/serie.json` | Consulta `get_data` por categoría: fecha, marca, plataforma, `digital_predict` y `timesfm`. |
| `dashboard/datasets/cats.json` | Consulta de categorías con actividad en los últimos 30 días. |
| `dashboard/params.json` | Valores iniciales de los filtros (categoría, desde, plataforma). |
| `dashboard/meta.json` | Título del dashboard. |

El formato de estos archivos es el del artefacto. No se ejecutan solos: sirven como respaldo y para revisar cambios.

## Qué muestra

- Filtros: categoría, marca a analizar, competidores, plataforma (una a la vez) y fecha desde.
- Indicadores de la marca: inversión estimada, cuota de la categoría, posición y variación de 28 días contra 28 previos.
- Inversión semanal frente a la competencia, cuota, mezcla por plataforma y tabla comparativa.
- Estimado frente a pronóstico TimesFM, con el error WAPE diario por marca.

## Definiciones y supuestos

- Inversión estimada: columna `digital_predict`. Se asume USD, la tabla no lo indica.
- `inversion_real` no se usa porque viene vacía en las categorías probadas.
- TimesFM: columna `timesfm`, serie del modelo de pronóstico para las mismas fechas. La tabla no tiene fechas futuras.
- WAPE diario: suma de |TimesFM − estimado| por marca y día, dividida por la inversión estimada total.
- La tabla trae datos diarios desde 2026-01-01 por marca y plataforma. Una carga completa son unas 120 mil filas, por eso la página consulta una categoría a la vez.
- Cada lector necesita el conector Windsor en su propia cuenta de claude.ai. El nombre del conector en las consultas es `Windsor.ai`.

## Despliegue en Vercel

Estructura: `public/` (página y D3 incluido, sin CDN), `api/data.js` (función de servidor), `vercel.json`. No hay paso de build.

### Variables de entorno (Vercel > Project Settings > Environment Variables)

| Variable | Qué es |
|---|---|
| `WINDSOR_API_KEY` | Clave de la API de Windsor. Solo vive en el servidor; el navegador nunca la ve. |
| `WINDSOR_ACCOUNT` | Cuenta del conector `mysql`. Por defecto `reporting01.markplan.com__infomedia_marts__mart_digital_predict_industria`. |
| `DASHBOARD_PASSWORD` | Contraseña compartida del dashboard. Obligatoria: sin ella la API responde 500. |
| `SESSION_SECRET` | Opcional. Texto aleatorio que se mezcla en la firma de la cookie de sesión. |

### Cómo se protege

- La clave de Windsor queda en el servidor. La función solo acepta parámetros validados (`tipo`, `categoria`, `desde`, `plataforma`) y arma ella misma la consulta; no reenvía consultas arbitrarias.
- La página pide una contraseña compartida al abrir. El navegador la envía una sola vez a `POST /api/login` (cuerpo JSON, admite cualquier carácter) y el servidor la compara con `DASHBOARD_PASSWORD`. Si coincide, responde con la cookie `dp_session` (HttpOnly, SameSite=Strict, Secure en HTTPS, 8 horas) firmada con HMAC.
- `/api/data` exige esa cookie: sin ella responde 401. Si falta `DASHBOARD_PASSWORD` responde 500 con un mensaje explícito.
- Cambiar `DASHBOARD_PASSWORD` cierra todas las sesiones abiertas. `SESSION_SECRET` es opcional y se mezcla en la firma.
- `DELETE /api/login` borra la cookie (cerrar sesión).
- Cada intento queda en los logs de Vercel como una línea `[auth] {...}` (`login_ok`, `login_clave_incorrecta`, `login_falta_variable`, `data_sin_sesion`, etc.) con IP, navegador y despliegue. Nunca incluye la contraseña ni el token; en `login_clave_incorrecta` solo se registran longitudes, para detectar espacios o claves truncadas.
- Las respuestas llevan `Cache-Control: private`. No hay límite de intentos de contraseña; si hace falta, usa el firewall de Vercel.
- La contraseña es compartida, no hay usuarios individuales. Para control por persona, usa Vercel Authentication o SSO.

### Probar en local

```bash
cp .env.example .env   # completar los tres valores
npm run dev            # http://localhost:3000
npm run test:handler   # pruebas de api/data.js con Windsor simulado
```

### Punto a verificar en el primer despliegue

La función llama a `https://connectors.windsor.ai/mysql` con los parámetros `api_key`, `select_accounts`, `fields`, `date_from`, `date_to`, `date_filters`, `filters` y `_renderer=json`. Esa forma está escrita de memoria y no se pudo contrastar con la documentación de Windsor. Si Windsor responde error, la página muestra "No se pudo cargar" y el mensaje exacto de Windsor sale en la respuesta de `/api/data` (pestaña Network). Los nombres de parámetros están todos en `windsor()` dentro de `api/data.js`.

La función vuelve a filtrar por categoría, fecha y plataforma, así que el resultado es correcto aunque Windsor ignore alguno de esos filtros. En ese caso solo cambia el tamaño de la descarga.

### Límites

- La respuesta de una función de Vercel no puede superar 4,5 MB. La API ya envía las filas en columnas con diccionarios; una categoría muy grande con muchos meses podría acercarse al límite. Si pasa, acota con el filtro Desde o por plataforma.
- `maxDuration` está en 60 s; las consultas largas a Windsor pueden necesitarlo.
