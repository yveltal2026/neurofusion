# COG-20261029-abandono-inactividad — Actividad y abandono en participaciones por liga

- Fecha y responsable: 2026-10-29, Codex a petición del propietario.
- Estado: implementado localmente; integración y despliegue pendientes.
- Tipo: corrección y mejora.
- Alcance: compartido; verificar políticas institucionales antes de replicar.
- Origen: `yveltal2026/neurofusion`, `main`, base `19c96bd762cd7a1dfce55fdb8239c33e80870ef7`.
- Rama: `fix/participation-inactivity`.
- Referencias de implementación: commit y PR pendientes.
- Dependencias: migraciones previas de estudios y baterías; `COG-20261028-compatibilidad-universitaria` para réplica. Independiente del PR #9 de resultados/análisis, todavía no integrado en la base inspeccionada.

## Problema y comportamiento final

Cerrar una pestaña dejaba la sesión como `started` indefinidamente. Las dos horas que antes se usaban para reservar cupo no cambiaban su estado. Las participaciones solo se abandonaban al reiniciar un intento individual o al fallar el enlace de un paso.

Ahora:

1. IAT, variantes, encuestas y webcam envían presencia cada 30 segundos después de iniciar una sesión real, mientras la página está visible. Leer una pantalla sin escribir sigue siendo actividad. Abrir una liga sin iniciar o usar vista previa no crea seguimiento.
2. Ocultar o cerrar la página envía una señal de inactividad mediante `sendBeacon`, con alternativa `fetch`/`keepalive`. La señal es orientativa: una recarga o desconexión breve no provoca abandono inmediato.
3. `Inactiva` aparece al recibir esa señal, o después de 2 minutos sin presencia. Después de 30 minutos sin actividad, la sesión se clasifica como `Abandonada por inactividad`. Una señal tardía no revive un intento individual vencido ni modifica uno completado.
4. La batería mantiene la presencia de sus pasos en curso, incluidos pasos embebidos y exposición. Puede retomarse desde el mismo dispositivo y cookie, conservando pasos completados, si sigue publicada y disponible, hay cupo y la política de repetición permite reanudar. El paso incompleto sigue el mecanismo de reinicio existente; no se inventa restauración de respuestas no guardadas.
5. El cupo usa la última actividad y el plazo de 30 minutos. Una sesión larga con presencia sigue reservando lugar aunque hayan pasado más de dos horas desde el inicio. Reanudar una batería vencida vuelve a comprobar cupo para evitar sobrepasarlo.
6. Los resúmenes de estudios, Datos IAT y baterías distinguen actividad e inactividad y se refrescan cada 30 segundos mientras el panel esté visible. Los contadores son de participaciones/intentos; no identifican personas únicas entre dispositivos.
7. Se conservan respuestas, resultados y exclusiones. Inactividad no equivale a mala calidad y no cambia puntuaciones. Los estados canónicos de DB siguen siendo `started`, `completed`, `abandoned`; `inactive` es una clasificación de presencia para la interfaz.

## Implementación

- `src/lib/participation-activity*.ts`: límites, etiquetas, reconciliación con permisos y endpoint compartido de presencia.
- `/api/s/[token]/activity` y `/api/b/[token]/activity`: validan liga, UUID, cookie de dispositivo firmada, pertenencia a la sesión y límites de petición. Nunca reciben un dispositivo ni una fecha confiable desde el cuerpo del cliente.
- `src/components/use-participation-activity.ts`, `participation-expired.tsx`: ciclo de presencia y mensaje cuando el servidor confirma que el intento ya no está activo. La cámara se detiene si la sesión de webcam vence.
- Runners IAT, variante, encuesta, batería y laboratorio webcam: activan seguimiento únicamente para sesiones reales. Los pasos embebidos habituales dependen de la presencia de la batería.
- `study-participation-summary.tsx`, `activity-refresh.tsx`, vistas de Datos IAT, resumen/carga de batería y resúmenes por herramienta: muestran estados y actualizan contadores.
- `20261029062815_participant_activity.sql`: timestamps de presencia/abandono, motivo, índices, trigger de transición, RPC de presencia exclusivo del servidor, reconciliación limitada a la organización y actualización de los RPC de inicio/cupo/reanudación.
- Pruebas del hook, API, clasificación y resumen; SQL `12_participation_activity.sql`. Los servidores falsos de las pruebas existentes ahora aceptan la ruta de presencia sin alterar la comprobación del protocolo de respuestas.

## Dependencias y configuración

- Sin dependencias ni variables nuevas. Usa Supabase y `PARTICIPANT_LOCK_SECRET` existentes.
- Aplicar `supabase/migrations/20261029062815_participant_activity.sql` después de las migraciones previas y antes del código. Generada mediante la CLI de Supabase. Solo aplicada a PostgreSQL 16 temporal durante esta entrega.
- No requiere cron: la clasificación temporal es determinista y se persiste al consultar los paneles del investigador o recibir una señal vencida. Los paneles abiertos se refrescan cada 30 segundos. Si nadie consulta ni envía señales, el valor físico de DB puede seguir como `started` hasta reconciliar; el cálculo de cupo aplica igualmente el vencimiento por fecha.
- Migración histórica: sin señales antiguas se utiliza `completed_at` o `started_at`. Los intentos iniciados hace más de 30 minutos que siguen abiertos se marcan abandonados; los completados se conservan. Esto estima inactividad histórica, no reconstruye la hora real de cierre. Una pestaña con código anterior al despliegue todavía no envía presencia y puede necesitar reiniciar su intento.
- Las exportaciones históricas mantienen el estado canónico; los nuevos estados de presencia se muestran en los paneles. No cambia el guardado parcial de encuestas ni el protocolo de tiempos/calibración.

## Réplica

1. Revisar versión, contrato universitario y configuración de acceso del destino; conservar su identidad, dominios y políticas.
2. Revisar el diff de implementación; referencias de commit pendientes. Si no comparten arquitectura, adaptar los cinco runners y los equivalentes de carga/resumen.
3. Aplicar la migración antes del código. Comprobar cookies y rutas por dominio del destino; no transferir secretos.
4. Ejecutar `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2` y `scripts/verify-sql.sh` en una base desechable. La suite SQL incluye rechazo de otro dispositivo/organización, señales duplicadas, vencimiento, cupo y reanudación.
5. En el destino, iniciar por liga, cerrar/ocultar y comprobar Inactiva; volver antes de 30 minutos y comprobar actividad; dejar vencer y comprobar Abandonada por inactividad y cupo libre. Probar recarga/reanudación de batería conservando pasos terminados, cierre después de completar y vista previa sin escrituras.
6. Verificar el recorrido autenticado en navegador real y actualizar la ficha/matriz con referencias de integración y despliegue. Una prueba local no certifica producción ni otra universidad.

## Compatibilidad universitaria

- Plataforma madre: no modifica registro, login, roles, dominios ni altas de alumnos. Las nuevas lecturas usan RLS; el RPC de reconciliación exige `auth.uid()` y membresía de la organización del único estudio/batería solicitado. La presencia requiere la cookie firmada del participante y el RPC de escritura solo se concede a `service_role`.
- Anáhuac Mayab/otras universidades: sin verificar. Acreditación de maestro, dominios permitidos y acceso de alumnos pendientes de inspección en cada repositorio. Conservar maestro/alumno y prohibición de autorregistro de alumnos. Adaptar la autorización de paneles y RPC si los miembros de la organización tienen permisos diferentes en el destino.
- Conclusión: comprobado localmente en origen; compatibilidad de acceso institucional y despliegue sin verificar. Ver `docs/backlog/ADOPCION.md`.

## Validación real y limitaciones

- `npm run typecheck`: correcto. `npm run lint`: correcto.
- `npm test -- --maxWorkers=2`: 98 archivos, 1,134 pruebas correctas. Incluye señales de navegador, ausencia de seguimiento en vista previa, fallo de red sin abandono inmediato, vencimiento confirmado por servidor y limpieza de intervalos.
- `scripts/verify-sql.sh` en PostgreSQL 16 temporal: correcto, incluidas pruebas nuevas y anteriores de RLS, sesiones, encuestas, variantes y baterías.
- Prueba adicional aplicando la migración sobre una base con registros simulados previos al cambio: `LEGACY_ACTIVITY_MIGRATION_OK`; el intento antiguo pasa a abandonado por inactividad, el reciente continúa iniciado y el completado conserva su estado y fecha de finalización.
- Build webpack con fuentes simuladas temporales mediante `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`: correcto. No se cambia la configuración del producto ni se conserva ese artefacto para despliegue. Build con fuentes reales requiere acceso a Google Fonts en el entorno.
- Pendientes: aplicar a Supabase remoto, navegación autenticada y cierre físico de navegador en producción, integración y despliegue. Las señales de cierre pueden perderse; se cubren con el vencimiento temporal. El limitador de peticiones sigue siendo por instancia, como el existente.

## Recuperación

Revertir el código no restaura los motivos/estados anteriores a la migración ni las reservas de cupo. Conservar los nuevos campos y resultados para auditoría. Restaurar los RPC de inicio/cupo/reanudación de la versión anterior si se revierte la funcionalidad; no eliminar columnas mientras el código las consulta. No reactivar masivamente intentos abandonados ni borrar resultados como parte de una reversión.

## Historial

- 2026-10-29: implementación y comprobaciones locales sobre `main`; sin cambios en producción.
