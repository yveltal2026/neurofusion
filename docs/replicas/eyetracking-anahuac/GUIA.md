# Paquete de eyetracking para Anáhuac

ID compartido: **COG-20261028-eyetracking-movil**. Edición del paquete: **2026-10-30.1**.

El propietario confirmó el funcionamiento correcto en el Samsung S25 Ultra con Android/Chrome después del PR #22. Esta confirmación corresponde a CognIA de origen; la instalación y validación en Anáhuac siguen pendientes. No establece una precisión universal ni garantiza el funcionamiento de todos los teléfonos.

## Contenido y alcance

El manifiesto identifica los commits exactos de origen y base y los SHA-256 de cada archivo. El parche consolida los cambios de PR #10 y #12–#22, desde `19c96bd762cd7a1dfce55fdb8239c33e80870ef7` hasta `f476cd795e0b033a81ef82301fa9c6136383eb3e` (consultar el hash completo del manifiesto).

- Cámara frontal móvil, detección facial y recuperación GPU/CPU, worker CPU con dos imágenes y lectura asíncrona de GPU. No reutiliza lecturas para elevar la frecuencia.
- Prevención de recortes inválidos, arranque con progreso y tiempos de espera, diagnóstico descargable, distinción entre análisis y mirada válida.
- Vista de cámara junto a calibración, tamaño de pantalla con tarjeta ID-1, buena iluminación comprobada y recomendación de soporte fijo.
- Calibración de 18 puntos, revisión selectiva, ajuste fino y validación independiente de la base cuando la corrección fina no es fiable. Mantiene el mínimo de 15 FPS y controles de precisión.
- Controles de mirada entre bloques, recuperación que conduce al ajuste necesario, conservación de bloques validados y reanudación sin duplicar la sesión.

`cambios.patch` contiene sólo los archivos de producto modificados de `src/lab/eyetracking/`, los binarios versionados de `public/web/tfjs-wasm/` y la prueba de navegador. **No incluye package.json ni lockfile, proxy, autenticación, rutas de servidor, registro, branding o configuración institucional.**

`FICHA.md` conserva el historial de origen hasta el commit fijado; la confirmación posterior del propietario queda en esta guía y en el manifiesto. Los verificadores requieren Python 3.9 o posterior.

`base/` permite comparar los archivos antes del cambio. `actual/` contiene el módulo completo, pesos locales y prueba de navegador del commit final, incluidos archivos de apoyo que no cambiaron. No copiarlo automáticamente sobre el destino. `referencia/` incluye el esquema de calidad y recolector de observaciones, sólo para comparar sus contratos; no reemplaza las reglas del servidor universitario.

## Aplicación en el repositorio universitario

1. Extraer el ZIP fuera del árbol del destino. Ejecutar `python3 verificar.py` dentro del paquete; debe indicar integridad correcta. Revisar `MANIFIESTO.json` y esta guía.
2. Identificar la rama/commit actual de Anáhuac y crear una rama de trabajo limpia. Conservar un commit anterior para recuperación. Incorporar el mismo ID a su backlog, índice y matriz de adopción.
3. Ejecutar `python3 /ruta/al/paquete/verificar.py --destino /ruta/al/repositorio`. Es una comparación de lectura: distingue archivos ya actualizados, iguales a la base, nuevos y divergentes. El código de salida 2 indica divergencias (1 indica fallo de integridad/lectura). Un archivo divergente exige comparar y adaptar; no usar una copia forzada.
4. Si las rutas y bases coinciden, comprobar desde el repositorio de destino:

   ```sh
   git apply --check /ruta/al/paquete/cambios.patch
   git apply /ruta/al/paquete/cambios.patch
   ```

   Si la comprobación falla, adaptar los cambios usando `base/`, `actual/` y el diff. No aplicar todo el historial de merges ni copiar el proyecto madre. El ZIP incluye `--binary` para los WASM.
5. Instalar las cuatro dependencias indicadas en `DEPENDENCIAS.json` con el gestor del destino, preservando sus demás dependencias. Para npm:

   ```sh
   npm install --save-exact @mediapipe/tasks-vision@0.10.35 @tensorflow/tfjs-core@4.22.0 @tensorflow/tfjs-backend-wasm@4.22.0 webeyetrack@0.0.2
   ```

   Regenerar **su** lockfile. No copiar el de origen ni actualizar React/Next por esta réplica. El origen usa Next 16.4.3/React 19.3.0; revisar compatibilidad del bundler del destino.
6. Comprobar `/web/model.json` y `/web/group1-shard1of1.bin` contra el manifiesto. Ya existían en la base; por ello no están en el parche. Si faltan, incorporar esos dos archivos de `actual/public/web/` después de comparar. Servir JSON, pesos y WASM sin redirección al login, con MIME correcto. Mantener la ruta `/web/tfjs-wasm/4.22.0/` y su licencia. Adaptar únicamente la excepción de recursos estáticos que falte en el destino; no sustituir su proxy ni abrir rutas privadas.
7. Resolver equivalencias de los componentes UI/participante conservando logo, textos institucionales y diseño de Anáhuac. El módulo requiere los componentes importados desde `@/components/participant` y `@/components/ui`; no se incluye el branding de origen. Mantener montaje exclusivamente cliente de `EyeTrackingLabClient.tsx`.
8. Revisar contratos: `EyeStudyAsset` contiene `id`, `title`, `url`; el modo de estudio usa `token`, `title`, `assets`, `durationSeconds`, `preview`. Conservar las rutas y permisos existentes del destino. Adaptar el corredor si sus APIs no equivalen a `POST /api/s/:token/eye/start` y `/eye/complete`. Revisar esquema de observaciones/calidad con `referencia/`, sin copiar acceso a datos.
9. El servidor debe comprobar controles de deriva completos y calidad: el layout `v5-weighted-base-fallback` conserva las restricciones de `v5-`. La precisión limitada sólo procede en la recuperación explícita prevista y no cuenta como mapa válido. No aceptar un `passed` del cliente sin comprobación del servidor. Si el destino usa otro protocolo, adaptar y probar antes de habilitarlo.

## Dependencias de ejecución

HTTPS y permiso de cámara; MediaPipe JS/WASM 0.10.35 desde `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`; modelo facial desde `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`. El motor de escritorio conserva los recursos MediaPipe 0.10.3 que usa WebEyeTrack 0.0.2. Los recursos externos no están incluidos en el ZIP. Revisar CSP/red institucional sin debilitar su política. El worker CPU debe compilarse como worker clásico y cargar sus chunks del mismo origen. No requiere nuevos secretos, variables, migraciones ni cabeceras de aislamiento.

## Comprobación antes de desplegar Anáhuac

Ejecutar las pruebas del destino y las pruebas de `src/lab/eyetracking` y de su servidor de calidad; typecheck, lint y build. En origen pasaron 168 pruebas de eyetracking/calidad, tipos, lint y build webpack. Las pruebas de laboratorio usan Vitest/jsdom y aliases `@/`; adaptar su configuración si difiere. La prueba de navegador usa Playwright y el laboratorio con `?engine=fake`; no permitir datos simulados en estudios reales. El contrato de pesos/WASM requiere acceso a los archivos locales del modelo. Las pruebas simuladas no prueban detección facial física.

Probar en escritorio y Android/Chrome con cámara real:

- Permisos, descarga/cancelación y reinicio; rostro detectado y mirada válida como señales diferentes.
- Buena/mala iluminación, referencia de pantalla y soporte; 18 fijaciones y validación independiente. Rechazar baja precisión y lecturas insuficientes.
- Diagnóstico: backend, captura, frecuencia válida, motivos de descarte, latencia y evaluación fina por eje. No exigir CPU en teléfonos cuya GPU funciona.
- Rechazo fino con base válida y con base inválida: sólo el primero puede avanzar tras validar.
- Fallo del control después de imagen 2, cambio de tamaño, interrupción de cámara, recalibración y reanudación desde el último bloque validado. Finalizar con una sola sesión y observaciones completas.
- Guardado real en el entorno de prueba universitario y exclusión de participación limitada de mapas válidos.

Aplicar además el contrato `COMPATIBILIDAD_UNIVERSITARIA.md`: sólo maestros acreditados con correo autorizado pueden autorregistrarse; alumnos no pueden autorregistrarse ni obtener privilegios de maestro manipulando el cliente. Conservar el mecanismo propio de acreditación y acceso de alumnos. Verificar UI y solicitudes directas al servidor con cuentas de prueba. Repo, dominios, acreditación y alta de alumnos del destino siguen sin identificar en este paquete; registrarlos allí sin secretos.

Registrar commit/PR, evidencias y despliegue del **destino**, sin darlo por certificado por las pruebas del origen. Recuperación: revertir el commit adaptado y las cuatro dependencias/lockfile correspondientes; no hay migraciones de datos. Evitar revertir personalizaciones o cambios ajenos.

## Reconstrucción del paquete en origen

```sh
python3 scripts/package-eyetracking.py --output /tmp/eyetracking-anahuac-2026-10-30.1.zip
```

El generador toma archivos de Git del commit fijado, sin incluir modificaciones de trabajo, secretos, datos de participantes ni otros segmentos del producto. No aplica cambios ni despliega el destino.
