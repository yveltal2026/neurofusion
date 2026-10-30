# Backlog de CognIA

Registro versionado de cambios y de su adopción entre ediciones universitarias. Incluye trabajo pendiente y entregado; complementa los roadmaps técnicos existentes. El nombre oficial es CognIA; las rutas y referencias técnicas históricas pueden conservar «NeuroFusion».

## Índice

| ID | Cambio | Estado del trabajo en origen | Alcance |
| --- | --- | --- | --- |
| [COG-20261028-eyetracking-movil](cambios/COG-20261028-eyetracking-movil.md) | Cámara móvil, vista junto a calibración y medición de pantalla con tarjeta | Primera entrega integrada: [PR #10](https://github.com/yveltal2026/neurofusion/pull/10); seguimiento de Android/Chrome con 0 lecturas en [PR #12](https://github.com/yveltal2026/neurofusion/pull/12) | Compartido |
| [COG-20261028-registro-cambios](cambios/COG-20261028-registro-cambios.md) | Backlog y protocolo para replicar cambios | Integrado en `main` | Compartido |
| [COG-20261028-actividad-analisis-visual](cambios/COG-20261028-actividad-analisis-visual.md) | Señales de actividad durante análisis de imágenes | Integrado en `main` | Compartido |
| [COG-20261028-diagnostico-cascada-gemini](cambios/COG-20261028-diagnostico-cascada-gemini.md) | Confirmar por qué responde Flash Lite | En diagnóstico; requiere acceso al despliegue | Compartido; configuración por edición |
| [COG-20261028-compatibilidad-universitaria](cambios/COG-20261028-compatibilidad-universitaria.md) | Preservar roles y registro exclusivo de maestros al replicar | Integrado en `main` | Proceso compartido; política de ediciones universitarias |

La [matriz de adopción](ADOPCION.md) indica qué se ha verificado en cada edición. Una ficha implementada no implica que esté integrada o desplegada.

## Registrar un cambio

1. Busca si ya existe una ficha del mismo alcance.
2. Copia [PLANTILLA.md](PLANTILLA.md) a `cambios/COG-AAAAMMDD-descripcion-breve.md`, usando la fecha local del responsable. Si hay colisión con otro trabajo, añade un sufijo identificable. Conserva el ID al replicarlo.
3. Completa la ficha y añade una fila al índice y a la matriz. Para un cambio exclusivo indica la universidad y el motivo.
4. Incluye la documentación en la misma entrega que la implementación. Una ficha puede agrupar varios commits del mismo cambio; enumera todos en orden.
5. Al integrar, registra el commit o PR y actualiza el estado con evidencia. Los commits que implementan el cambio se pueden referenciar desde una actualización posterior de la ficha, sin intentar registrar el hash del propio commit que todavía no existe.

Estados del trabajo: **propuesto → en diagnóstico / en curso → implementado localmente → integrado**. También se puede marcar **descartado** con motivo. El despliegue y la adopción se registran por destino en la matriz, de forma independiente.

## Replicar en otro repositorio

Es obligatorio revisar el [contrato de compatibilidad universitaria](COMPATIBILIDAD_UNIVERSITARIA.md): las ediciones universitarias distinguen alumnos y maestros y sólo permiten autorregistro de maestros con correo institucional. Cada ficha debe documentar su impacto y la evidencia por destino antes de dar una réplica por validada. La plataforma madre no es la fuente de sus reglas de acceso.

1. Confirma la versión del destino, dependencias y personalizaciones; revisa la ficha y el diff completo antes de aplicar. No transfieras secretos, datos, dominios ni identidad institucional.
2. Si ambos repositorios comparten historial, trae los commits desde el repositorio de origen y aplica los commits de implementación en el orden de la ficha mediante `git cherry-pick -x <SHA>`. Trabaja en una rama de réplica. Si el commit es un merge, revisa sus padres y prefiere los commits de implementación; no elijas un padre automáticamente.
3. Si no comparten historial o la arquitectura diverge, implementa el comportamiento descrito como adaptación. Registra los archivos equivalentes y las diferencias; no lo marques como copia exacta.
4. Aplica migraciones/configuración descritas y ejecuta los criterios de aceptación en el destino. Una prueba de origen no certifica otra edición.
5. Conserva el ID y la ficha en el destino. Registra su commit/PR y el método utilizado (`cherry-pick` o adaptación). Actualiza la matriz central cuando haya evidencia verificable.
6. Marca «desplegado» sólo después de confirmar el despliegue y su comprobación funcional. Un merge por sí solo no prueba producción.

Al incorporar una edición, copia también las instrucciones de CognIA de `AGENTS.md`. Este registro no conecta repositorios ni crea automatizaciones: cada entrega debe actualizarlo. Los cambios hechos fuera de este flujo necesitan incorporarse con su evidencia.

## Alcance inicial

El registro empieza con esta sesión; no es un inventario retrospectivo completo. El código de partida inspeccionado es `f53ec571a2884aab5901872521cb36a82057331e` de `main` en `yveltal2026/neurofusion`. Las fichas iniciales distinguen los cambios de esta entrega de ese punto de partida. El propietario ha establecido `main` como fuente central del backlog para las réplicas universitarias; consultar siempre su versión actualizada. No se ha inspeccionado el repositorio de Anáhuac Mayab ni otras ediciones.
