# Quickstart & Verification: 002-web-eyetracking

## Validación de código y pruebas

```bash
npm run typecheck
npm run lint
npm test
```

## Validación manual de ambos modos

1. **Modo Sitio en Vivo (`live_snippet`)**:
   - Crear estudio `web_eyetracking` con URL local de prueba y 2 pasos.
   - Copiar el `<script>` en una página HTML de prueba e iniciar desde `/s/[token]`.
   - Confirmar barra flotante, calibración, envío de lotes a `/api/s/[token]/web-eyetrack/events` y heatmap en resultados.
2. **Modo Sin Código (`no_code_captures`)**:
   - Crear estudio `web_eyetracking` en modo sin código, subir 2 capturas web largas y definir un hotspot.
   - Completar la sesión desde `/s/[token]` con scroll vertical y verificar métricas por paso.
