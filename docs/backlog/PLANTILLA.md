# COG-AAAAMMDD-descripcion-breve — Título

- Fecha y responsable: pendiente.
- Estado del trabajo: propuesto / en diagnóstico / en curso / implementado localmente / integrado / descartado.
- Tipo: mejora / corrección / configuración / infraestructura / datos / documentación.
- Alcance: compartido / exclusivo de una edición (indicar cuál y por qué).
- Origen: repositorio, rama y commit base verificables.
- Referencias de implementación: commits en orden y PR, o pendiente.
- Dependencias de otros cambios (IDs): ninguna / indicar.

## Problema y comportamiento esperado

Describir el desencadenante y el resultado observable antes/después. Incluir criterios de aceptación comprobables.

## Implementación

Archivos afectados y propósito. Diferencias permitidas por edición. Evitar datos sensibles.

## Dependencias y configuración

Versiones necesarias, nombres de variables (sin valores secretos), migraciones y orden. Indicar explícitamente «ninguna» o «pendiente de confirmar» cuando corresponda.

## Réplica

Pasos ordenados, commits a aplicar o adaptación necesaria, configuración por destino y cómo verificar el resultado. Si no hay commits disponibles, no presentar el cherry-pick como ejecutable todavía.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil: indicar repositorio/rama y las reglas de `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`.
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: sí / no, con archivos o configuración inspeccionados como evidencia. Sin inspección: «sin verificar».
- Adaptación necesaria: indicar qué se conserva o adapta; no sustituir la política de la universidad por la de la plataforma madre.
- Acreditación de maestro y dominios autorizados: mecanismo del destino o «pendiente de identificar». No asumir que cualquier correo institucional es de maestro.
- Acceso de alumnos: conservar el mecanismo del destino; no habilitar autorregistro ni autoasignación de rol.
- Comprobaciones: referencia a evidencia de los casos del contrato universitario, o pendientes explícitos. Para cambios sin impacto, documentar la revisión del diff y referenciar una validación vigente del destino; si no existe, dejar pendiente.
- Conclusión para el destino: compatible y verificado / requiere adaptación / sin verificar / no aplica con motivo. No confundir implementación de la mejora con permiso para desplegarla.

## Validación y limitaciones

Comandos realmente ejecutados, resultados y entorno; criterios aún no verificados. Referenciar la fila de `docs/backlog/ADOPCION.md` para cada destino.

## Recuperación

Cómo revertir el comportamiento y qué precauciones requieren datos o migraciones; no asumir que revertir código revierte datos.

## Historial de la ficha

- Fecha: creación y evidencia disponible.
