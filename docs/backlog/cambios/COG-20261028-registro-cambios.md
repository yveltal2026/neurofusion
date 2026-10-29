# COG-20261028-registro-cambios — Registro y réplica entre ediciones

- Fecha y responsable: 2026-10-28, Codex por solicitud del propietario.
- Estado: integrado en `main`; despliegue sin verificar.
- Tipo: documentación y proceso.
- Alcance: compartido.
- Origen: `https://github.com/yveltal2026/neurofusion`, rama de trabajo `fix/visual-analysis-feedback`, base `f53ec571a2884aab5901872521cb36a82057331e` de `main`.
- Commit de implementación: `4097c6b` — `docs(cognia): establish shared backlog and university adoption tracking`. Sin PR; integración directa en `main` autorizada por el propietario.
- Dependencias de otros cambios: ninguna.

## Problema y resultado

Las mejoras se desarrollan en repositorios paralelos y no existe un registro común de qué se cambió ni dónde se replicó. Se introduce un índice, fichas con IDs estables y una matriz por edición. Se reconoce CognIA como nombre oficial en el README y en las instrucciones del repositorio.

Criterios: cada cambio nuevo tiene ficha, referencias verificables y pasos de réplica; cada destino conserva el ID y su propia evidencia de integración, validación y despliegue. Ninguna universidad se marca como actualizada sin comprobarlo.

## Implementación

- `AGENTS.md`: instrucciones permanentes para mantener el registro en futuras entregas.
- `README.md`: nombre oficial y acceso al backlog.
- `docs/backlog/README.md`: índice, estados, límites y procedimiento.
- `docs/backlog/PLANTILLA.md`: estructura para nuevas fichas.
- `docs/backlog/ADOPCION.md`: destinos y seguimiento independiente.
- `docs/backlog/cambios/`: fichas iniciales de este cambio, la actividad visual y el diagnóstico de Gemini.

La actualización de nombre es documental; no cambia aún toda la interfaz, dominios ni identificadores técnicos.

## Dependencias y réplica

Sin paquetes, variables ni migraciones. En cada repositorio de destino:

1. Incorpora `docs/backlog/` conservando IDs y evidencia del origen.
2. Añade la sección de CognIA de `AGENTS.md` sin reemplazar las instrucciones locales existentes.
3. Añade un enlace al índice desde su README y conserva su identidad universitaria.
4. Completa el destino y añade commits/PR, fecha y evidencia propia en la matriz; no copies la validación del origen como validación local.
5. Mantén la matriz central al replicar futuras mejoras. No hay sincronización automática.

Para replicar este registro, trae y aplica `4097c6b` y la actualización de referencias de esta entrega (consulta el historial de `docs/backlog/` en `main`), o incorpora sólo los documentos pertinentes si el destino tiene estructura diferente. La edición de Anáhuac Mayab necesita vincularse a su repositorio antes de verificar adopción.

## Validación y limitaciones

Revisión documental, comprobación de enlaces relativos y `git diff --check`. No requiere pruebas de ejecución. El registro comienza con esta sesión y no reconstruye todo el historial anterior. Las instrucciones sólo están instaladas en este repositorio.

## Recuperación

Revertir el cambio documental si fuera necesario, conservando las fichas históricas en Git. No afecta datos de la aplicación.

## Historial

- 2026-10-28: creado el registro inicial con estados locales y destinos sin verificar.
- 2026-10-28: corregido el nombre oficial a CognIA por indicación del propietario; cambio aún local y sin commit.
- 2026-10-28: integrado en `main` por solicitud del propietario; commit de implementación `4097c6b`. Despliegue y adopción universitaria sin verificar.
