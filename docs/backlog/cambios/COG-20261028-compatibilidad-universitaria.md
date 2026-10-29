# COG-20261028-compatibilidad-universitaria — Preservar acceso universitario

- Fecha y responsable: 2026-10-28, Codex por solicitud del propietario.
- Estado: implementado localmente; pendiente de integrar.
- Tipo: documentación y proceso de réplica.
- Alcance: proceso compartido; restricciones de acceso exclusivas de ediciones universitarias.
- Origen: `https://github.com/yveltal2026/neurofusion`, `main`, base `59f1a196a5b77f75ea54defa3a6f0f7b52c88b92`.
- Commits/PR de implementación: pendientes.
- Dependencias: COG-20261028-registro-cambios.

## Problema y comportamiento esperado

Las universidades tienen maestros y alumnos. Sólo los maestros pueden generar una cuenta con correo institucional; los alumnos no pueden autorregistrarse. Una réplica de mejoras desde la plataforma madre debe conservar esta diferencia además del branding.

Se introduce un contrato explícito, evaluación de impacto obligatoria en las fichas y seguimiento por destino. El dominio institucional no acredita por sí solo el rol de maestro. La política se registra como requisito declarado; su implementación universitaria todavía no se ha inspeccionado.

## Implementación

- `AGENTS.md`: obligación de conservar restricciones del destino en cada réplica.
- `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`: reglas y casos de aceptación.
- `docs/backlog/PLANTILLA.md`: apartado obligatorio de compatibilidad por destino.
- `docs/backlog/README.md`: índice y paso obligatorio de revisión.
- `docs/backlog/ADOPCION.md`: perfiles de acceso y estado de compatibilidad independiente de la implementación.

## Dependencias y configuración

Sin paquetes, variables ni migraciones. No cambia autenticación o permisos en código, ni introduce el registro universitario en la plataforma madre.

## Réplica

1. Incorporar contrato, plantilla e instrucciones de AGENTS.md conservando las instrucciones específicas de cada universidad.
2. Completar su perfil con dominios autorizados, acreditación de maestros y mecanismo de acceso de alumnos, tras inspeccionar el destino.
3. Clasificar cada actualización según el contrato y registrar su evidencia antes de validarla para ese destino.
4. Ejecutar los casos de aceptación cuando se toque acceso o no exista una verificación vigente. Conservar el ID y añadir los commits de destino a la matriz.

## Compatibilidad universitaria

Impacto directo: sólo documentación del proceso. Las reglas de acceso se preservan como requisito y no se modifican en código. Compatibilidad de Anáhuac Mayab: sin verificar; repositorio, acreditación de maestros, dominios y alta permitida de alumnos pendientes de identificar. Lo mismo aplica a futuras ediciones hasta inspeccionarlas.

## Validación y limitaciones

Revisión de consistencia con los requisitos del propietario, enlaces relativos e IDs del índice/matriz y `git diff --check`. No se ejecutan pruebas de aplicación para un cambio documental. No se han probado los flujos de acceso de ninguna universidad ni instalado estas instrucciones en sus repositorios.

## Recuperación

Revertir la documentación no modifica cuentas ni permisos. Conservar el historial del contrato y no considerar su eliminación una autorización para habilitar autorregistro de alumnos.

## Historial

- 2026-10-28: restricciones universitarias registradas por indicación del propietario; implementación de cada destino pendiente de verificar.
