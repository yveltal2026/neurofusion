# COG-20261028-diagnostico-cascada-gemini — Verificar el primer modelo gratuito

- Fecha y responsable: 2026-10-28, Codex por solicitud del propietario.
- Estado: en diagnóstico; requiere acceso al despliegue.
- Tipo: diagnóstico de configuración.
- Alcance: compartido; configuración independiente por edición.
- Origen inspeccionado: `https://github.com/yveltal2026/neurofusion`, `main`, commit `f53ec571a2884aab5901872521cb36a82057331e`.
- Commits/PR de implementación: no hay; no se han modificado modelos.
- Dependencias de otros cambios: ninguna.

## Problema y hallazgos

El propietario observa análisis guardados con `gemini · gemini-3.5-flash-lite · nf-vision-1.3` y espera que primero se intente el modelo gratuito de 3.8.

`src/lib/ai/tiers.ts` configura primero `gemini-free:gemini-3.8-flash` y después `gemini-free:gemini-3.5-flash-lite`. El identificador configurado es 3.8 Flash, sin «Lite». Su disponibilidad real para el proyecto de Google no se ha comprobado; no sustituirlo por un nombre supuesto.

`src/lib/ai/index.ts` permite reemplazar el orden mediante `AI_CASCADE`. `src/lib/ai/cascade.ts` devuelve la primera respuesta válida y pasa al siguiente modelo ante fallos; omite temporalmente niveles por cuota, autenticación o tiempo agotado. La etiqueta del resultado identifica al modelo de la lectura principal, no todos los intentos ni necesariamente el de la segunda revisión.

## Investigación pendiente por destino

1. Identificar el proyecto/equipo de Vercel y el despliegue activo; confirmar rama y commit.
2. Revisar `AI_CASCADE` de Production y la presencia de `GEMINI_API_KEY_FREE` o su alternativa `GEMINI_API_KEY`. No registrar valores secretos. No confundir Preview con Production ni presencia de una clave con autorización válida.
3. Correlacionar un análisis reciente con Runtime Logs buscando `[ai]`; documentar el error de 3.8, respuesta del siguiente nivel y posibles pausas. La ausencia de una línea no demuestra éxito ni que el modelo haya sido intentado.
4. Si los registros indican modelo inexistente o sin acceso, confirmar los identificadores y disponibilidad con el proyecto correspondiente de Google antes de cambiar la configuración.
5. Si se cambia configuración, redesplegar y verificar una nueva solicitud; registrar qué modelo respondió y por qué hubo fallback, si ocurrió.

Criterio de cierre: se conoce la configuración efectiva y existe evidencia del intento de 3.8 o del motivo concreto de su omisión. No se exige que siempre responda 3.8 si está activado el fallback.

## Validación y limitaciones

Código y pruebas de cascada inspeccionados; pruebas relevantes correctas dentro de las 67 de la ficha de actividad visual. La conexión de Vercel disponible no encontró un proyecto llamado `neurofusion`; falta el enlace o identificación del proyecto correcto. No se ha leído configuración ni registros de esa producción. No hay causa confirmada todavía.

## Réplica y recuperación

Replicar el procedimiento de diagnóstico, no copiar claves entre universidades. No hay parche, dependencia o migración que aplicar todavía. Si se modifica configuración, conservar su versión anterior de forma segura para restaurarla y redesplegar si fuera necesario.

## Historial

- 2026-10-28: orden del código confirmado; configuración y registros del despliegue pendientes.
