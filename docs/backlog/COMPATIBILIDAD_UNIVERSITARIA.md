# Contrato de compatibilidad de ediciones universitarias

Requisitos indicados por el propietario el 2026-10-28. Aplican a Anáhuac Mayab y a futuras ediciones universitarias; no imponen un cambio al registro de la plataforma madre.

## Reglas que una actualización debe preservar

| Aspecto | Regla |
| --- | --- |
| Tipos de usuario | Maestro y alumno; conservar sus permisos y separación existentes |
| Registro propio | Sólo los maestros pueden generar su cuenta |
| Correo de registro | El maestro debe usar un correo de los dominios institucionales autorizados en esa edición |
| Acreditación de maestro | Conservar el mecanismo de la universidad; pertenecer al dominio institucional no basta para distinguir maestros de alumnos |
| Alumnos | No pueden crear su propia cuenta ni obtener un rol de maestro mediante el registro |
| Acceso de alumnos | Conservar el mecanismo existente en el destino; no se ha definido aquí si usa invitaciones, altas administradas u otro proceso |
| Personalización | Conservar branding, dominios, configuración institucional y datos del destino |

Si falta identificar el mecanismo de acreditación o de acceso de alumnos, se registra como pendiente; no se reemplaza por una suposición. Un correo institucional de alumno sigue sin autorizar su registro propio.

## Evaluación antes de replicar

1. Identificar repositorio, versión y entorno del destino. Revisar su implementación real de acceso y la configuración que la controla.
2. Revisar el diff completo, incluidas dependencias compartidas, migraciones, valores por defecto y configuración. Clasificar la réplica como «sin impacto», «requiere adaptación» o «sin verificar», justificándolo en la ficha.
3. Si toca registro, login, roles, permisos, invitaciones/altas o dominios, adaptar el cambio para conservar estas reglas. No resolver conflictos copiando indiscriminadamente los archivos de la plataforma madre.
4. Verificar controles de servidor además de la interfaz. No basta con quitar enlaces de registro ni con confiar en un rol enviado por el cliente.
5. Registrar evidencia por destino en la ficha y en la matriz. No marcar «compatible y verificado» ni «listo para desplegar» mientras falte esa evidencia. Esto es una comprobación técnica, no una nueva solicitud de aprobación para cada réplica.

## Casos de aceptación

Usar cuentas de prueba y el mecanismo de acreditación propio del destino; no registrar correos reales, contraseñas ni tokens en el backlog.

| Caso | Resultado requerido |
| --- | --- |
| Maestro acreditado con correo institucional autorizado | Puede completar el registro mediante el flujo permitido |
| Persona sin acreditar como maestro, aunque tenga correo institucional | No puede obtener una cuenta de maestro por autorregistro |
| Registro con correo ajeno a los dominios institucionales autorizados | Se rechaza el autorregistro |
| Alumno intenta registrarse desde interfaz, URL directa o solicitud al servidor | No se crea una cuenta por autorregistro |
| Cliente manipula el rol o solicita privilegios de maestro | Se rechaza; no se conceden permisos adicionales |
| Alumno existente accede mediante el mecanismo permitido | Conserva su acceso y permisos de alumno |
| Maestro existente inicia sesión y utiliza sus funciones | Conserva acceso y permisos de maestro |

Si el cambio no afecta acceso, documentar la revisión del diff y referenciar una verificación vigente del destino. Si no hay evidencia previa, la compatibilidad continúa sin verificar. Los casos se validan de nuevo cuando cambia alguna parte del flujo de acceso o su configuración.

## Perfil de cada universidad

La matriz debe mantener un perfil por edición con repositorio, dominios autorizados (sin secretos), mecanismo para acreditar maestros, acceso de alumnos y referencia de la última verificación. No copiar claves ni configuraciones de una universidad a otra. La versión documental del contrato es `COG-20261028-compatibilidad-universitaria`; conservar el ID al incorporarlo en otros repositorios.
