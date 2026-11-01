# Digital Predict: competencia de inversión digital

Dashboard para analizar una marca y compararla con su competencia dentro de la misma categoría. Los datos salen de la tabla `reporting01.markplan.com / infomedia_marts.mart_digital_predict_industria`, consultada en vivo con Windsor (conector `mysql`).

La versión publicada es un artefacto de Claude de tipo Dashboard: https://claude.ai/artifact/MrZjGBo8rDJqYCJmVfdVxb

## Qué contiene

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
