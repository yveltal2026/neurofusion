# Research: Eyetracking para Web (002-web-eyetracking)

## 1. Estrategia de permisos de cámara entre dominios (`live_snippet`)

- **Problema**: Las políticas de permisos del navegador (`Permissions-Policy` / `getUserMedia`) están ligadas al **origen** de la página. Si el participante calibra en `aesteros.com` y navega a `cliente.com`, el navegador exige nuevo permiso y la calibración geométrica cambia si cambia el contexto de renderizado.
- **Decisión**: En modo `live_snippet`, `/s/[token]` realiza únicamente el consentimiento, valida la disponibilidad del estudio, genera un `session_grant` temporal de corta duración y redirige a `targetUrl?nf_session=<grant>`. El snippet en `<head>` de `cliente.com` ejecuta la calibración y el tracking directamente en el dominio del cliente.
- **Alternativa descartada**: Embeber `cliente.com` dentro de un `<iframe>` en Aesteros falla en la mayoría de sitios modernos por cabeceras `X-Frame-Options: DENY` o `Content-Security-Policy: frame-ancestors`.

## 2. Seguridad y CORS del snippet embebido

- **Decisión**: El estudio guarda `allowedOrigins` derivados de la URL objetivo (más dominios adicionales opcionales del mismo sitio, p. ej. `checkout.cliente.com`). Los endpoints `/api/s/[token]/web-eyetrack/*` responden cabeceras `Access-Control-Allow-Origin` únicamente cuando el header `Origin` de la petición coincide exactamente con la lista permitida del estudio.
- **Identificación de sesión**: El `nf_session` en la URL se intercambia por un `sessionId` firmado en `sessionStorage` del sitio destino para persistir entre recargas/navegación multipágina dentro del mismo flujo.

## 3. Normalización de mirada con Scroll y distintos Viewports

- **Decisión**: Cada muestra enviada contiene `{ t, x, y, scrollX, scrollY, vw, vh, docW, docH, stepId }`, donde `(x, y)` son coordenadas normalizadas `[0..1]` en viewport. El motor determinista en `engine/normalize.ts` proyecta cada punto al espacio del documento de referencia (`docX = (x * vw + scrollX) / docW`, `docY = (y * vh + scrollY) / docH`) para poder agregar usuarios con distintas resoluciones sobre la captura de referencia de cada paso.

## 4. Modo Sin Código (`no_code_captures`)

- **Decisión**: Reutilizar `visual_assets` (`study_id` + `position` por paso) y `src/lab/eyetracking/` dentro de `WebEyeCaptureRunner.tsx`. El contenedor renderiza la captura web a ancho completo con scroll vertical y registra `(x, y, scrollY)` junto con clics en *hotspots* normalizados `[x0, y0, x1, y1]` para avanzar de paso.
