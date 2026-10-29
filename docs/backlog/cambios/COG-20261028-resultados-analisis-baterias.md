# COG-20261028-resultados-analisis-baterias — Eyetracking en baterías y análisis contextual

- Fecha y responsable: 2026-10-28, Codex a petición del propietario.
- Estado del trabajo: implementado localmente; integración y despliegue pendientes.
- Tipo: mejora.
- Alcance: compartido; verificar permisos institucionales antes de replicar.
- Origen: `yveltal2026/neurofusion`, `main`, base `19c96bd762cd7a1dfce55fdb8239c33e80870ef7`.
- Rama de implementación: `ajustes-resultados-analisis`.
- Referencias de implementación: commits y PR pendientes.
- Dependencias de otros cambios: `COG-20261028-compatibilidad-universitaria` para réplica.

## Problema y comportamiento esperado

Los estudios de webcam se ocultaban del selector de baterías y su incorporación se rechazaba en SQL. Las encuestas y el eyetracking no ofrecían análisis con IA. La batería tenía un informe integrado sin navegación por pestañas ni consulta conjunta de respuestas individuales y miradas.

Comportamiento final:

1. Los estudios de webcam del mismo proyecto aparecen como pasos de eye tracking, con conteo de piezas. Requieren piezas, token, configuración válida y publicación del estudio para participar.
2. La batería ejecuta el laboratorio de webcam con calibración, consentimiento de cámara, validación, recuperación y guardado habituales. Enlaza la sesión mediante `link_battery_step` y avanza tras guardar. La vista previa no guarda datos.
3. Las pestañas de batería son Resumen, Resultados y Análisis. Resultados conserva el informe integrado y añade desplegables por participante con respuestas, medidas y estado por paso, además de mapas de mirada filtrados a la batería.
4. Encuestas y eyetracking tienen una pestaña Análisis. El contexto previo exige material, objetivo del material y objetivo de la marca; público y pregunta son opcionales. Puede revisarse en cada generación.
5. El análisis conserva contexto, agregados, resultado y modelo en un historial de las últimas diez generaciones. Detecta cambios en agregados/exclusiones aun cuando el tamaño de muestra sea el mismo.
6. La IA recibe agregados deterministas, sin identificadores de participantes, respuestas abiertas ni coordenadas de mirada. El informe de batería distingue predicciones de IA, medidas implícitas, autoinformes y estimaciones de webcam; no inventa cruces de mirada por participante.
7. Mínimo de tres participantes incluidos; las baterías necesitan además tres datos utilizables en al menos una medida. Excluye miradas limitadas, de baja calidad o excluidas. En batería usa participantes completados y respeta exclusiones en pasos completados. Para mirada cuenta una sola sesión válida por participante de batería (primera por orden estable de ID), evitando inflar la muestra con reintentos.

## Implementación

- `src/tools/battery/{engine/order,load,participant}.ts`, runner y editor: reconocer webcam como herramienta de batería conservando almacenamiento `visual` con `config.eyeTracking`.
- `src/lab/eyetracking/EyeTrackingLab.tsx` y ruta `eye/start`: enlazar sesión y comunicar finalización al runner de batería.
- `src/tools/battery/ui/participant-results.tsx`, pestañas y páginas de batería: resultados individuales y miradas en la misma página.
- `src/tools/research-analysis/`: contexto validado, cargas con RLS, agregación de mirada, límite de costo, generación estructurada con la abstracción de IA existente, persistencia e historial.
- `src/components/study-tabs.tsx` y página de análisis: enrutar encuestas y webcam sin alterar análisis IAT.
- Migración `20261029054046_research_analysis_and_battery_eye.sql`: aceptar webcam en composición, impedir finalizarla por el RPC de exposición, crear historial con RLS por organización. No modifica tablas de autenticación ni introduce registro de usuarios.
- Pruebas específicas y SQL `10_eye_tracking.sql` / `11_research_analyses.sql`: protocolo, permisos, aislamiento, privacidad y snapshots.

## Dependencias y configuración

- Se conservan dependencias y proveedores de IA de `main`; no se cambian modelos ni orden de la cascada.
- Requiere aplicar todas las migraciones previas y luego `supabase/migrations/20261029054046_research_analysis_and_battery_eye.sql` al destino antes de activar el código. La migración se generó mediante la CLI de Supabase.
- Usa la configuración Supabase y las variables del proveedor de IA ya existentes. No se añaden secretos ni variables.
- La migración solo se ha aplicado a PostgreSQL 16 temporal para validación; no a Supabase remoto.

## Réplica

1. Revisar versión y personalizaciones del destino; consultar el contrato universitario y su mecanismo real de acreditación de maestros y acceso de alumnos.
2. Revisar el diff completo y adaptar las páginas, el enlace de sesiones y las políticas al destino. Commits de implementación pendientes; todavía no hay cherry-pick documentado ejecutable.
3. Aplicar la migración después de las migraciones base de baterías y webcam. Conservar roles y permisos del destino: no copiar autenticación de la plataforma madre.
4. Ejecutar tipos, lint, pruebas relevantes y `scripts/verify-sql.sh` en una base desechable.
5. Verificar con usuario autorizado una batería webcam → IAT/encuesta: calibrar, guardar, continuar, consultar respuestas y mapas por participante, excluir un participante y generar análisis con contexto. Comprobar inaccesibilidad desde otra organización y usuario sin permiso de análisis.
6. Verificar un análisis real con el proveedor del destino y su persistencia; actualizar esta ficha y la matriz con evidencia. Integración y despliegue son estados separados.

## Compatibilidad universitaria

- Plataforma madre: cambios basados en `requireUser`, lecturas con el cliente autenticado/RLS y endpoints de participante existentes. No se modifica registro, autenticación, asignación de roles, dominios ni altas de alumnos. Se añaden permisos de lectura/escritura de historial dentro de la organización; un destino con permisos distintos entre maestro/alumno debe adaptar esas políticas y la acción de IA.
- Anáhuac Mayab y otras ediciones: **sin verificar**. No se ha inspeccionado ningún repositorio o entorno universitario. Acreditación de maestro, dominios autorizados y acceso de alumnos pendientes de identificar en cada destino. No habilitar autorregistro ni autoasignación de roles de alumnos al replicar.
- Conclusión: implementación comprobada en origen local; compatibilidad de permisos universitarios pendiente de revisión y prueba. Consultar `docs/backlog/ADOPCION.md`.

## Validación y limitaciones

- `npm run typecheck`: correcto.
- 213 pruebas específicas de baterías, nuevo análisis, privacidad y protocolo de mirada: correctas.
- `scripts/verify-sql.sh` contra PostgreSQL 16 en contenedor temporal: correcto, incluye RLS del historial y rechazo del bypass por exposición.
- `npm run lint`: correcto. Suite completa `npm test`: 98 archivos, 1,130 pruebas correctas. Las comprobaciones específicas se repitieron al ajustar agregados de mirada y tipos de los dobles de prueba.
- Compilación de producción: la ejecución normal no puede descargar Google Fonts en este entorno. `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/tmp/cognia-font-responses.cjs npm run build -- --webpack` terminó correctamente, con fuentes simuladas exclusivamente para la prueba y permisos para el proceso interno del compilador. El archivo temporal no se incorpora al repositorio ni al despliegue; no se cambian las fuentes del producto. El build normal con sus fuentes reales sigue pendiente de verificación en un entorno con acceso a Google Fonts.
- Pendientes: Supabase remoto, recorrido con usuario real y cámara física, llamada real de IA y despliegue.
- El CSV integrado histórico mantiene sus columnas IAT/variantes/encuestas/exposición. Los mapas de mirada de la batería ofrecen sus propios CSV filtrados; no se añaden correlaciones mirada × encuesta ni cambios de metodología de webcam.
- El control de costo combina el historial por estudio/batería con un limitador en memoria por investigador; no es una reserva atómica de cuota entre instancias.
- El historial muestra las diez generaciones más recientes; los registros anteriores permanecen almacenados. El contexto se conserva al generar, no como borrador independiente.

## Recuperación

Revertir el código y restaurar la guarda anterior para impedir nuevas composiciones con webcam requiere antes retirar/duplicar las baterías que ya la usan. No eliminar pasos de baterías con participantes. Conservar sesiones y `research_analyses` para no perder resultados; revertir código no revierte datos. No borrar el historial ni las mediciones como parte de una reversión rutinaria.

## Historial

- 2026-10-28: implementación local sobre `main`, pruebas específicas y SQL temporal correctas; sin intervención en producción.
