# Adopción por edición de CognIA

## Destinos

| Edición | Repositorio | Rama de integración | Entorno/despliegue |
| --- | --- | --- | --- |
| CognIA, origen de este registro | [yveltal2026/neurofusion](https://github.com/yveltal2026/neurofusion) | `main` | Pendiente de identificar; sin acceso confirmado al proyecto de Vercel |
| Anáhuac Mayab | Pendiente de vincular | Sin verificar | Sin verificar |
| Otras universidades | Añadir una fila por edición cuando exista | Sin verificar | Sin verificar |

## Matriz

La integración de una mejora no certifica su compatibilidad de acceso universitario. Consultar el [contrato universitario](COMPATIBILIDAD_UNIVERSITARIA.md) y registrar la evidencia por destino.

| ID | Edición | Implementación / integración | Validación en destino | Despliegue |
| --- | --- | --- | --- | --- |
| COG-20261030-imagenes-cuestionario | CognIA, origen | Implementación local sobre `main` (`b67b23c`); commit/PR pendientes | 409 pruebas correctas con Storage simulado y sharp real; TypeScript, ESLint y build con fuentes simuladas correctos. Chromium local 1360×900 y 390×844: carga, seis formatos, imágenes del participante y envío en preview. Supabase real pendiente: sin claves y consulta de sólo lectura rechazada por el conector | Pendiente |
| COG-20261030-imagenes-cuestionario | Anáhuac Mayab | Sin aplicar | Sin verificar; conservar autenticación, roles, registro institucional y controles de Storage del destino | Sin verificar |
| COG-20261028-eyetracking-movil | CognIA, origen | Seguimientos PR #10–#22 integrados en `main`; implementación `0f020a4`, [PR #22](https://github.com/yveltal2026/neurofusion/pull/22), merge `96acaa9`. Historial en la ficha | Propietario reporta dos rechazos de ajuste fino. Revisión selectiva previa y conservación de base sólo para validación independiente; 168 pruebas, TypeScript, ESLint y build webpack correctos. Se prueba inicio bloqueado con precisión insuficiente y finalización tras validar. Pruebas con cámara/API simuladas; propietario confirma ahora funcionamiento correcto del origen tras #22. Paquete 2026-10-30.1 verificado por integridad/aplicación sobre base; generador/guía integrados mediante PR #23 (`05af188`). Universidades sin verificar | Preview PR #22 correcto en `0f020a4`; estado Vercel de main `96acaa9` correcto, [referencia](https://vercel.com/neurofusion1/neurofusion/7pqyMaRxkW6P4ye9ycCdLK44VVoM). Runtime remoto sin inspeccionar; cámara física pendiente |
| COG-20261028-eyetracking-movil | Anáhuac Mayab | Paquete 2026-10-30.1 preparado; [guía](../replicas/eyetracking-anahuac/GUIA.md). Sin aplicar: repositorio aún no vinculado | Sin verificar; requiere adaptación y pruebas en destino | Sin verificar |
| COG-20261028-registro-cambios | CognIA, origen | Integrado en `main`: `4097c6b` | Revisión documental y enlaces locales | No verificado |
| COG-20261028-actividad-analisis-visual | CognIA, origen | Integrado en `main`: `e4bd3fc` | 67 pruebas relevantes, TypeScript y ESLint correctos; sin comprobación en producción | No verificado |
| COG-20261028-diagnostico-cascada-gemini | CognIA, origen | Diagnóstico; sin cambio de modelos | Orden del código inspeccionado; configuración y registros de producción pendientes | No aplica todavía |
| COG-20261028-registro-cambios | Anáhuac Mayab | Sin verificar | Sin verificar | Sin verificar |
| COG-20261028-actividad-analisis-visual | Anáhuac Mayab | Sin verificar | Sin verificar | Sin verificar |
| COG-20261028-diagnostico-cascada-gemini | Anáhuac Mayab | Sin verificar | Sin verificar | Sin verificar |
| COG-20261028-compatibilidad-universitaria | CognIA, origen | Integrado en `main`: `5c4d4fd` | Contrato documental revisado; no cambia acceso de la plataforma madre | No aplica al comportamiento de la app |
| COG-20261028-compatibilidad-universitaria | Anáhuac Mayab | Sin verificar | Requisito declarado; implementación sin inspeccionar | Sin verificar |

Al verificar una integración, sustituye «local» o «sin verificar» por el commit/PR del destino y la fecha. Para un despliegue, añade su referencia y la comprobación realizada. Usa «no aplica» sólo con un motivo documentado. Ningún registro de origen certifica automáticamente Anáhuac Mayab u otra universidad.

## Perfiles de acceso protegidos

| Edición | Roles y autorregistro exigidos | Dominios autorizados | Acreditación de maestro | Acceso de alumnos | Última verificación técnica |
| --- | --- | --- | --- | --- | --- |
| CognIA, plataforma madre | Política universitaria no impuesta; conservar su política propia | No inspeccionados para esta ficha | No aplica al contrato universitario | No aplica al contrato universitario | No realizada |
| Anáhuac Mayab | Maestro/alumno; sólo maestros con correo institucional pueden autorregistrarse; alumnos no | Pendientes de identificar | Mecanismo pendiente de inspeccionar; dominio por sí solo insuficiente | Conservar el existente; pendiente de identificar | Sin verificar; requisito declarado por el propietario el 2026-10-28 |
| Futuras universidades | Maestro/alumno; sólo maestros con correo institucional pueden autorregistrarse; alumnos no | Definir por edición | Identificar por edición | Conservar el de cada edición | Sin verificar; crear perfil individual al incorporar cada universidad |

## Compatibilidad de réplicas pendientes

| ID | Destino | Evaluación de compatibilidad | Evidencia / siguiente paso |
| --- | --- | --- | --- |
| COG-20261028-eyetracking-movil | Anáhuac Mayab | Sin verificar | Paquete consolidado disponible; identificar repositorio, adaptar corredor y servidor, conservar política institucional y probar cámara real/controles de acceso vigentes |
| COG-20261028-registro-cambios | Anáhuac Mayab | Sin verificar | Incorporar instrucciones y revisar perfil universitario |
| COG-20261028-actividad-analisis-visual | Anáhuac Mayab | Sin verificar | El parche de origen es de interfaz visual; revisar diff adaptado y verificación de acceso vigente del destino |
| COG-20261028-diagnostico-cascada-gemini | Anáhuac Mayab | Sin verificar | Diagnosticar configuración de IA propia sin sustituir configuración de acceso |
| COG-20261028-compatibilidad-universitaria | Anáhuac Mayab | Sin verificar | Incorporar contrato y acreditar cumplimiento de los casos de aceptación |

Para nuevas réplicas añadir una fila por ID/destino y clasificar como «compatible y verificado», «requiere adaptación», «sin verificar» o «no aplica» con motivo. No marcar como validada o lista para desplegar una réplica con compatibilidad pendiente.
