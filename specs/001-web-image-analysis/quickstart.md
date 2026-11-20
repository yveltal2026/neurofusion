# Quickstart & Verification: 001-web-image-analysis

## Validación de código y pruebas

```bash
npm run typecheck
npm run lint
npm test
```

## Validación de migración SQL (si hay Postgres local disponible)

```bash
scripts/verify-sql.sh
```

## Recorrido manual en desarrollo (`npm run dev`)

1. Abrir un proyecto existente en `/projects/[id]` y pulsar **Nuevo estudio**.
2. Confirmar que en la categoría **Diagnóstico digital** aparece **Análisis de Imagen Web** y que **Análisis visual con IA** queda enfocado en piezas gráficas/anuncios.
3. Crear el estudio `web_visual`, subir 1–2 capturas (Desktop/Mobile), ejecutar el análisis y revisar la vista de resultados y reporte.
4. Abrir un estudio `visual` previo y verificar que sigue operando sin errores.
