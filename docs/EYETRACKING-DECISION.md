# Eye tracking con webcam: investigación y decisión

Fecha: 2026-10-14 · Estado: **propuesta para aprobar** (no hay código de eye tracking aún)

## 1. Qué necesitamos

Un módulo de eye tracking que corra en el **navegador del participante** (laptop con webcam, celular o tableta), sin hardware especial, que entregue puntos de mirada (x, y, tiempo) por estímulo, y que encaje con lo que ya tenemos: Next.js 16 (Turbopack) + React 19 + TypeScript, Supabase, participantes que entran por liga mágica (`/s/[token]`), y el principio de privacidad del README («el video no sale del dispositivo»; la IA nunca ve datos crudos).

## 2. Opciones evaluadas

| Opción | Licencia | Estado (verificado) | Corre en navegador | Veredicto |
|---|---|---|---|---|
| **WebGazer.js** (Brown) | GPL-3.0; LGPL-3.0 sólo si la empresa vale < US$1 M | v3.5.3, publicada 2026-02-24. El README dice que el **mantenimiento oficial terminó** («works as intended, but updates are no longer guaranteed»). 3.9k★. Paquete de ~70 MB desempaquetado | Sí, 100 % cliente | Descartada como motor principal |
| **WebEyeTrack** (RedForestAI) | **MIT** | v0.0.2 en npm (2025-09-18). 62★, 421 commits, 3 issues abiertos. Respaldada por un paper (arXiv 2508.19544). Depende de `@mediapipe/tasks-vision` y TF.js | Sí; inferencia en Web Worker; modelo BlazeGaze (~670 KB) | **Elegida** (con puerta de validación) |
| **MediaPipe Face Landmarker + regresión propia** | Apache-2.0 | `@mediapipe/tasks-vision` 1.1.0, publicada 2026-10-06 (mantenida por Google). 478 landmarks (con iris), matriz de pose de cabeza | Sí | **Plan B**, y además es la base de WebEyeTrack |
| **EyeGestures** | GPL-3.0 | Voluntarios; 651★; la integración web carga JS de `eyegestures.com` | Sí, pero dependiendo de su CDN | Descartada (licencia + dependencia externa) |
| **SaaS/SDK propietarios** (RealEye, GazeCloudAPI/GazeRecorder, Eyeware GazeSense) | Comercial | RealEye es plataforma de estudios (desde ~US$29/mes en Capterra, a verificar); Eyeware es SDK de escritorio con licencia | Varía | Fuera de alcance: no son abiertas y el video/datos salen de nuestro control |

Python-only (itrace, Unity/UniteEye) quedan fuera por no correr en navegador.

## 3. Compatibilidad con NeuroFusion

- **Todas las opciones web son sólo-cliente.** Hay que cargarlas con `"use client"` / import dinámico, nunca en SSR. El runner del participante ya es cliente, así que encaja.
- **Licencia.** NeuroFusion apunta a SaaS. WebGazer (GPL-3.0) se **entrega al navegador**, lo que cuenta como distribución; el copyleft obligaría a abrir el código del cliente que lo enlaza, o a depender de la excepción LGPL (< US$1 M de valuación, condición que cambió entre forks: 10 M vs 1 M). Es un riesgo de negocio evitable. MIT y Apache-2.0 no tienen ese problema. *(No es asesoría legal; conviene que lo confirme quien lleve lo legal.)*
- **Bundler.** El paquete `webeyetrack` declara `worker-loader` y trae configuración de webpack; este proyecto usa **Turbopack** (`next.config.ts`). La carga del worker y de los pesos del modelo (hay que copiar la carpeta `web/` a `public/`) **es el principal riesgo técnico de integración** y no pude probarlo aquí. Por eso la decisión incluye un spike.
- **Convenciones del repo.** Encaja con el registro de herramientas (`src/tools/registry.ts`, hoy `ToolType = "iat"`) agregando un tipo nuevo, y con el patrón «motor puro y testeado + runner cliente + servidor que valida». AGENTS.md exige leer `node_modules/next/dist/docs/` antes de escribir código: `node_modules` no está instalado en este entorno, así que eso queda para la fase de implementación.

## 4. Implicaciones y límites (aplican a *cualquier* eye tracking con webcam)

Evidencia revisada (resúmenes de búsqueda; no pude abrir los PDFs):

- **Precisión espacial.** WebGazer: ~4.2° en su paper original (≈175–210 px, [Papoutsaki 2016](https://cs.brown.edu/people/apapouts/papers/ijcai2016webgazer.pdf)); una [revisión de alcance](https://www.sciencedirect.com/science/article/pii/S2772766125000655) habla de ~4° de sensibilidad típica frente a 0.25–0.5° en rastreadores de laboratorio; una [evaluación reciente (MDPI)](https://www.mdpi.com/1995-8692/19/5/99) con 20 participantes midió **10–13.6°** según densidad de calibración. Conclusión: depende mucho del protocolo.
- **WebEyeTrack:** error reportado de 2.32 cm sobre GazeCapture, inferencia ~2.4 ms en iPhone 14 ([paper](https://arxiv.org/pdf/2508.19544)); un resumen secundario reporta 4.56 cm (MPIIFaceGaze) y 7.53 cm (EyeDiap). Si el usuario está a ~50 cm, 2.32 cm ≈ 2.7°; a ~30 cm (celular) ≈ 4.4° (cálculo mío, supuesto de distancia). **No hay validación independiente**.
- **Temporal.** Frecuencia efectiva 10–60 Hz según dispositivo; retrasos de 200–700 ms y efectos al 40–60 % del tamaño de laboratorio según la [revisión de 2026](https://arxiv.org/pdf/2605.02898).
- **Consecuencia metodológica:** sirve para **qué zona/elemento grande captó atención y en qué orden** (AOI a nivel de bloque, mapas de calor agregados con muestras de decenas de personas, comparación A/B de composiciones). **No** sirve para leer texto palabra por palabra, microfijaciones ni AOI pequeños (< ~4–5° ≈ 4–5 cm a 50 cm). Los resultados deben reportarse con su incertidumbre.
- **Condiciones no controladas.** Luz, reflejos, lentes, postura, distancia, inclinación del celular. Hay que **medir calidad por sesión** (error de validación tras calibrar; descartar o marcar sesiones malas), igual que ya hacemos con la validez del IAT.
- **Celular/tableta.** Cámara frontal y pantalla pequeña en mano: la cabeza y el dispositivo rotan (roll), la pantalla es chica, y el error en cm se vuelve más error angular por la distancia corta. WebEyeTrack está pensado para móvil (probado en iPhone 14 según el paper); **no verifiqué restricciones de getUserMedia/Safari iOS** — entra al spike.
- **Privacidad/legal.** Si el video se procesa **sólo en el dispositivo** y enviamos únicamente coordenadas, el dato de mirada por sí solo [normalmente no es biométrico](https://support.realeye.io/gdpr-compliance?hsLang=en) (siempre que no se use para identificar). Aun así: consentimiento explícito que mencione cámara y mirada, no subir video, retención mínima, y revisar con DPO si hay participantes de la UE. Nuestro candado anti-repetición **no** debe usar rasgos faciales.
- **Calibración.** Toda estimación necesita calibrar por sesión (WebEyeTrack: hasta ~9 muestras). Añade 30–60 s y una pantalla de instrucciones; es la mayor fuente de abandono.

## 5. Decisión

**Implementar sobre WebEyeTrack (MIT), encapsulado detrás de una interfaz propia `GazeEngine`**, con MediaPipe Face Landmarker como plan B.

Por qué:
1. Única opción **abierta con licencia permisiva** que además es reciente, está pensada para web y móvil, y trae calibración few-shot lista. WebGazer queda descartada por licencia y por mantenimiento terminado; EyeGestures por GPL y dependencia de su CDN; los SaaS por no ser abiertos y sacar los datos de nuestro control.
2. Corre en Web Worker y es ligera (modelo ~670 KB), clave para celulares.
3. Comparte dependencia con el plan B (`@mediapipe/tasks-vision`, Apache-2.0, activo): si WebEyeTrack no da la talla, reemplazamos sólo el regresor sin tirar la captura ni la UI.

Riesgos asumidos (por eso hay puerta de validación): v0.0.2 y comunidad mínima (62★), documentación escasa, integración con Turbopack sin probar, precisión sin validar de forma independiente.

## 6. Siguiente paso propuesto: spike de 1–2 días con criterio de salida

1. Instalar `webeyetrack` en una ruta aislada (`/lab/eyetracking`), cargarlo client-only, resolver worker + pesos con Turbopack.
2. Pantalla de calibración + validación de 9 puntos; registrar error en px, cm y grados, y fps efectivos.
3. Probar con 5–10 personas en: laptop, Android, iPhone/Safari, tableta; con y sin lentes; luz buena y mala.
4. **Criterios para seguir con WebEyeTrack:** error mediano ≤ ~4° en laptop y ≤ ~6° en celular tras calibrar, ≥ 15 fps efectivos, y funciona en Safari iOS. Si falla: plan B (MediaPipe + regresión ridge propia con la misma UI de calibración).
5. Con el resultado, diseñar el módulo: nuevo `ToolType`, estímulos (imágenes/anuncios) con AOI, runner con consentimiento de cámara, esquema Supabase (sólo coordenadas normalizadas + timestamps + métricas de calidad), motor puro de fijaciones y AOI con tests, y mapas de calor en el análisis.

## Fuentes

- [WebGazer (GitHub)](https://github.com/brownhci/WebGazer) · [npm registry: webgazer](https://registry.npmjs.org/webgazer)
- [WebEyeTrack (GitHub)](https://github.com/RedForestAI/WebEyeTrack) · [paper arXiv 2508.19544](https://arxiv.org/pdf/2508.19544) · [npm registry: webeyetrack](https://registry.npmjs.org/webeyetrack)
- [@mediapipe/tasks-vision (npm registry)](https://registry.npmjs.org/@mediapipe%2Ftasks-vision) · [Guía Face Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [EyeGestures (GitHub)](https://github.com/NativeSensors/EyeGestures)
- [Papoutsaki et al. 2016](https://cs.brown.edu/people/apapouts/papers/ijcai2016webgazer.pdf) · [Revisión de alcance, ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2772766125000655) · [Evaluación WebGazer, MDPI](https://www.mdpi.com/1995-8692/19/5/99) · [Modelos DL para webcam, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11133145/) · [Calidad de datos, arXiv 2605.02898](https://arxiv.org/pdf/2605.02898)
- [RealEye GDPR](https://support.realeye.io/gdpr-compliance?hsLang=en)
