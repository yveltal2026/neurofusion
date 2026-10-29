## CognIA: registro obligatorio de cambios

El nombre oficial del producto es **CognIA**. Los nombres técnicos heredados no se renombran automáticamente.

Para cada cambio o mejora de producto, corrección, configuración, datos, infraestructura o documentación:

1. Consulta [el backlog](docs/backlog/README.md) y reutiliza la ficha si continúas el mismo cambio; si es nuevo, créala desde [la plantilla](docs/backlog/PLANTILLA.md).
2. Conserva el mismo ID al portar el cambio entre repositorios. No reutilices un ID para otro alcance.
3. Actualiza la ficha y el índice en la misma entrega: problema, comportamiento final, archivos, dependencias, migraciones/configuración, pasos de réplica, validación real y limitaciones. No incluyas secretos ni datos personales.
4. Distingue implementación local, integración en una rama y despliegue. Registra commits/PR verificables cuando existan; usa «pendiente» si aún no existen, nunca inventes referencias o resultados.
5. Actualiza [la matriz de adopción](docs/backlog/ADOPCION.md) sólo con evidencia del repositorio/entorno de destino. Sin acceso, deja «sin verificar». Respeta identidad, autenticación, dominios y datos de cada universidad.
6. En la entrega final menciona los IDs afectados y cualquier paso de réplica o validación pendiente. Un ajuste rutinario a una ficha se registra en esa misma ficha, sin crear otra ficha sólo por actualizar el registro.

Estas instrucciones cubren este repositorio. Para aplicarlas en otra edición hay que incorporar allí el backlog y esta sección de AGENTS.md; no se asume sincronización automática.

### Compatibilidad obligatoria con ediciones universitarias

Antes de replicar cualquier cambio, consulta [las reglas universitarias](docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md) y completa el apartado de compatibilidad de la ficha. Las universidades tienen dos tipos de usuarios: **maestros y alumnos**. Sólo los maestros pueden generar su cuenta, usando correo institucional autorizado; los alumnos **no pueden autorregistrarse**. Un dominio institucional por sí solo no demuestra que alguien sea maestro. Conserva el mecanismo del destino para acreditar ese rol y para dar acceso a alumnos; no inventes un flujo de alta.

No sobrescribas autenticación, registro, asignación de roles, permisos o configuración institucional con los de la plataforma madre al replicar mejoras. Si un cambio los afecta, adapta y verifica las restricciones en el destino, incluidos intentos directos al servidor; ocultar un botón no es suficiente. Sin evidencia, registra «sin verificar» y no marques la réplica como validada o lista para desplegar. Estas reglas no cambian automáticamente el registro de la plataforma madre.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
