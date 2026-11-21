# COG-20261120-actualizacion-modelos-gemini4 — Actualización de cascada IA a Gemini 4 (Hydrogen, Neon, Carbon)

- Fecha y responsable: 2026-11-20 · Aesteros / NeuroFusion
- Estado del trabajo: implementado localmente (integración en rama/PR y despliegue pendientes)
- Tipo: mejora / configuración
- Alcance: compartido (configuración independiente por edición; puede sobrescribirse con `AI_CASCADE`)
- Origen: `yveltal2026/neurofusion`, rama `main`, base `abd543d`
- Referencias de implementación: pendiente (en preparación en rama de trabajo)
- Dependencias de otros cambios (IDs): ninguna (relacionado con `COG-20261028-diagnostico-cascada-gemini`)

## Problema y comportamiento esperado

Con la salida general de la familia **Gemini 4** hasta el 20 de noviembre de 2026 (`gemini-4-hydrogen` GA el 12-nov, `gemini-4-neon` GA el 18-nov y `gemini-4-carbon` GA el 10-nov como reemplazo oficial de `gemini-4-argon`), la cascada por defecto en `src/lib/ai/tiers.ts` seguía apuntando a `gemini-3.8-flash` y `gemini-4-argon`.

Orden por defecto actualizado (de menor a mayor costo, manteniendo fallback automático):
1. `gemini-free:gemini-4-hydrogen` (único modelo Gemini 4 con nivel gratuito; 2.5× más rápido que 3.8 Flash)
2. `gemini-free:gemini-3.5-flash-lite` (respaldo gratuito de alto rendimiento)
3. `anthropic:claude-haiku-5-5`
4. `gemini-paid:gemini-4-hydrogen`
5. `anthropic:claude-sonnet-5-5`
6. `gemini-paid:gemini-4-neon` (nivel intermedio entre Hydrogen y Carbon, menor latencia/costo por tarea)
7. `gemini-paid:gemini-4-carbon` (modelo frontera más capaz, reemplazo directo de `gemini-4-argon`)
8. `anthropic` (`claude-opus-5-5` por defecto, último recurso)

Además, se añade soporte para el nivel de razonamiento `xhigh` en `GeminiThinkingLevel` (compatible con Gemini 4 Hydrogen/Neon), manteniendo `low` como predeterminado para evitar tiempos mayores a 45 s en análisis con imágenes.

## Implementación

- `src/lib/ai/tiers.ts`: actualización de `DEFAULT_CASCADE`, `THINKING_LEVELS` y mensaje de ejemplo en `parseSpec`.
- `src/lib/ai/gemini.ts`: ampliación de `GeminiThinkingLevel` con `"xhigh"`.
- `.env.example`: documentación actualizada de `AI_CASCADE` y `GEMINI_THINKING_LEVEL`.
- `src/lib/ai/cascade.test.ts`: actualización de pruebas de orden de cascada, niveles omitidos por clave y nivel `xhigh`.

## Dependencias y configuración

- No requiere migraciones SQL ni nuevas variables de entorno.
- Si el despliegue en Vercel define explícitamente `AI_CASCADE`, esa variable sigue teniendo prioridad sobre `DEFAULT_CASCADE` (vaciar `AI_CASCADE` o actualizarla para usar los nuevos valores por defecto).

## Réplica

Aplicar el commit de implementación o adaptar `src/lib/ai/tiers.ts`, `src/lib/ai/gemini.ts`, `.env.example` y `src/lib/ai/cascade.test.ts`. Verificar que las claves `GEMINI_API_KEY_FREE` / `GEMINI_API_KEY_PAID` del destino tengan acceso en Google AI Studio a los modelos configurados.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil: plataforma principal Aesteros y futuras ediciones universitarias (`docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`).
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: **no** — el diff toca únicamente `src/lib/ai/*`, `.env.example` y `docs/backlog/*`.
- Adaptación necesaria: ninguna en acceso/roles; cada universidad conserva sus propias API keys y `AI_CASCADE` si las personalizó.
- Acreditación de maestro y dominios autorizados: sin cambios.
- Acceso de alumnos: sin cambios.
- Comprobaciones: sin acceso al repositorio/entorno universitario (`sin verificar` en destino).
- Conclusión para el destino: plataforma principal lista localmente; destinos universitarios **sin impacto en acceso / sin verificar en entorno destino**.

## Validación y limitaciones

- `npm run typecheck`: correcto.
- `npx eslint src/lib/ai/`: correcto (0 errores).
- `npx vitest run src/lib/ai/cascade.test.ts src/lib/ai/ai.test.ts`: pruebas aprobadas con mocks de red.
- Limitaciones: no se han ejecutado llamadas reales contra `generativelanguage.googleapis.com` desde este entorno porque no hay API keys de Google configuradas en el VM.

## Recuperación

Revertir el commit o sobrescribir temporalmente el orden desde la variable de entorno `AI_CASCADE` en Vercel sin redesplegar código.

## Historial de la ficha

- 2026-11-20: Actualización de modelos Google Gemini 4 (`gemini-4-hydrogen`, `gemini-4-neon`, `gemini-4-carbon`) y nivel `xhigh`.
