# Feature Specification: Registro Público DEMO, Límites/Créditos, Membresía por Perfil y Onboarding Gamificado

**Feature Branch**: `003-demo-onboarding-credits`  
**Created**: 2026-11-20  
**Status**: Draft  
**Input**: User description: "La plataforma ya va a ser pública por lo que debemos de darle a los usuarios la oportunidad de registrarse por primera vez en una demo limitada para conocer la plataforma: preguntar qué son al registrarse, limitar uso y créditos DEMO, espacios para solicitar o crecer membresía según su perfil, onboarding de primera vez con checklist interactivo + opción de tour guiado, y gamificación que otorgue más créditos al completar el onboarding."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro público con perfil de audiencia y activación DEMO (Priority: P1)

Un visitante nuevo accede a la pantalla de entrada pública de Aesteros para crear una cuenta por primera vez. Durante el registro selecciona qué tipo de perfil representa (*Investigador / Consultor*, *Agencia / Marca / Empresa*, *Docente*, *Estudiante* u *Otro*) y opcionalmente indica el nombre de su organización o institución. Al confirmarse su cuenta, entra directamente a su espacio de trabajo en modalidad **DEMO** con un saldo inicial de créditos y su segmento de audiencia registrado.

**Why this priority**: Es la puerta de entrada para abrir la plataforma al público, capturar qué audiencia llega y asignar desde el primer segundo el plan DEMO sin permisos elevados.

**Independent Test**: Se puede probar creando una cuenta nueva en la pantalla de entrada eligiendo un segmento de audiencia, verificando que el registro falla si no elige segmento y que tras iniciar sesión el perfil queda guardado y su organización arranca en plan `DEMO` con créditos iniciales.

**Acceptance Scenarios**:

1. **Given** un visitante en la pantalla de registro público, **When** intenta crear cuenta sin seleccionar qué perfil representa, **Then** el sistema indica que debe elegir su perfil antes de continuar.
2. **Given** un visitante que selecciona *Docente* (u otro perfil válido), ingresa su correo y contraseña válida y opcionalmente escribe su organización, **When** completa el registro, **Then** el sistema crea su cuenta, persiste su perfil de audiencia y asigna a su espacio de trabajo el plan `DEMO` con saldo inicial de 30 créditos.
3. **Given** un cliente malintencionado que intenta enviar en el registro un plan superior o un saldo de créditos mayor al predeterminado, **When** el servidor procesa el alta, **Then** ignora cualquier privilegio o saldo enviado por el cliente y asigna estrictamente `DEMO` y la dotación inicial estándar.

---

### User Story 2 - Límites DEMO y consumo de créditos en servidor (Priority: P1)

Un usuario con cuenta `DEMO` explora las herramientas de Aesteros. El sistema aplica topes estructurales propios de la demo (máximo 1 proyecto, hasta 3 estudios en ese proyecto y tope de respuestas de participantes por estudio) y descuenta créditos de su saldo únicamente cuando ejecuta acciones con costo de cómputo/IA (generar análisis con IA, sugerencias de estímulos con IA, auditorías SEO en vivo o análisis visual/web con IA). Desde la barra superior y al intentar una acción restringida, el usuario ve siempre cuántos créditos le quedan, cuánto cuesta la acción y qué hacer si llega al límite.

**Why this priority**: Protege los costos operativos y de APIs de IA desde el lanzamiento público, a la vez que comunica de forma transparente el valor de cada análisis.

**Independent Test**: Se puede probar con una organización en plan `DEMO` intentando crear un segundo proyecto o un cuarto estudio (bloqueo por tope estructural), y ejecutando un análisis con IA con saldo suficiente vs. con saldo en 0 (bloqueo por falta de créditos y registro exacto en el historial de movimientos).

**Acceptance Scenarios**:

1. **Given** un usuario `DEMO` con 1 proyecto existente, **When** intenta crear un segundo proyecto, **Then** la operación es rechazada por el servidor y se muestra un aviso claro con enlace al espacio de membresía.
2. **Given** un usuario `DEMO` con 3 estudios en su proyecto, **When** intenta crear o duplicar un cuarto estudio, **Then** el sistema bloquea la creación e informa el límite del plan `DEMO`.
3. **Given** un usuario `DEMO` con créditos suficientes (p. ej. 50) que ejecuta un análisis con IA o auditoría SEO en vivo, **When** la acción se inicia/ejecuta, **Then** el servidor descuenta atómicamente el costo en créditos, registra el movimiento en el historial y muestra el nuevo saldo.
4. **Given** un usuario `DEMO` con créditos insuficientes para una acción de IA o auditoría en vivo, **When** intenta ejecutarla, **Then** el servidor la bloquea sin consumir recursos externos y le sugiere completar su onboarding (si tiene bono pendiente) o ampliar su membresía.
5. **Given** un estudio perteneciente a una organización `DEMO` abierto por participantes externos, **When** alcanza el límite DEMO de respuestas (p. ej. 15 respuestas válidas/completadas), **Then** el servidor no acepta sesiones nuevas por encima del tope e informa al investigador que ampliando su membresía podrá recolectar más muestra.

---

### User Story 3 - Onboarding interactivo con opción de tour guiado y gamificación de créditos (Priority: P2)

Cuando un usuario nuevo entra por primera vez a su espacio de trabajo, encuentra un **checklist interactivo de bienvenida** con progreso visible (p. ej. 0/4 misiones completadas) y un botón destacado para iniciar un **tour guiado** paso a paso por la plataforma. Al ir completando acciones reales en la plataforma (revisar/confirmar perfil, crear primer proyecto, crear primer estudio y explorar la calculadora de muestra o vista de resultados/tour), las misiones se marcan como completadas y desbloquean créditos extra (+30 créditos en total) para seguir probando herramientas con IA.

**Why this priority**: Reduce la fricción del primer uso en usuarios públicos sin formación previa y convierte el aprendizaje en un incentivo tangible (más créditos de prueba).

**Independent Test**: Se puede probar con una cuenta recién creada: verificar que aparece el checklist, abrir y recorrer el tour guiado opcional, completar las misiones y comprobar que los créditos de recompensa se acreditan una sola vez sin poder duplicarse.

**Acceptance Scenarios**:

1. **Given** un usuario que inicia sesión por primera vez y aún no completa su onboarding, **When** entra a la pantalla principal de proyectos, **Then** visualiza el checklist interactivo de misiones con su barra de progreso y la opción de lanzar el **tour guiado** interactivo.
2. **Given** un usuario que abre el tour guiado, **When** avanza o cierra el recorrido, **Then** puede navegar paso a paso por las áreas clave (proyectos, herramientas, créditos y membresía) sin quedar atrapado si decide cerrarlo y reabrirlo más tarde.
3. **Given** un usuario que completa una misión real (p. ej. crea su primer proyecto o su primer estudio) o finaliza las misiones del onboarding, **When** el sistema valida la acción en el servidor, **Then** marca la misión como completada, muestra el avance gamificado y abona el bono de créditos correspondiente (+30 créditos en hitos o al completar).
4. **Given** un usuario que ya recibió los créditos de recompensa de una misión o del onboarding completo, **When** repite la acción o intenta reclamar el bono nuevamente mediante peticiones directas, **Then** el sistema no vuelve a otorgar créditos adicionales.
5. **Given** un usuario que ya completó o minimizó su checklist, **When** vuelve a entrar al espacio de trabajo, **Then** la interfaz permanece limpia y enfocada en sus proyectos (con acceso discreto para reabrir el tour o ver su progreso si lo desea).

---

### User Story 4 - Espacio de membresía y crecimiento adaptado al perfil (Priority: P2)

Desde la barra superior (indicador de plan/créditos) y desde cualquier aviso de límite alcanzado, el usuario accede a un espacio dedicado de **Plan y Membresía**. El contenido, los planes mostrados y los formularios de crecimiento se adaptan dinámicamente al segmento que eligió al registrarse:
- Quienes eligieron **Docente** o **Estudiante** ven opciones académicas (plan Docente/Aula, solicitud de licencia universitaria o verificación con correo institucional, más orientación para alumnos vs. profesores).
- Quienes eligieron **Agencia / Marca / Empresa** o **Investigador / Consultor** ven planes comerciales/Pro/Equipo, solicitud de ampliación o cotización y espacio para canjear códigos de activación/acceso anticipado.

**Why this priority**: Conecta la experiencia limitada DEMO con la conversión comercial o institucional personalizada según la audiencia real del usuario.

**Independent Test**: Se puede probar ingresando con una cuenta registrada como *Docente* y otra como *Agencia/Empresa*, visitando el espacio de membresía y verificando que cada una muestra su catálogo de opciones y formulario adaptado, además de persistir solicitudes de ascenso y canje de códigos de activación válidos.

**Acceptance Scenarios**:

1. **Given** un usuario registrado como *Docente* o *Estudiante*, **When** abre el espacio de membresía, **Then** visualiza rutas y planes orientados al ámbito académico (solicitud de licencia docente/institucional, verificación académica y límites ampliados para clase/investigación).
2. **Given** un usuario registrado como *Agencia / Marca / Empresa* o *Investigador / Consultor*, **When** abre el espacio de membresía, **Then** visualiza planes comerciales (Pro / Equipos / Créditos adicionales) y un formulario para solicitar ascenso o activar su membresía.
3. **Given** un usuario que envía una solicitud de crecimiento de membresía o licencia, **When** confirma el envío, **Then** la solicitud queda persistida con su perfil, plan solicitado y estado (*pendiente*), y el usuario recibe confirmación visible en la misma pantalla.
4. **Given** un usuario que cuenta con un código de activación/promoción válido emitido por la plataforma, **When** lo ingresa en el espacio de membresía, **Then** el servidor valida el código de forma atómica, actualiza su plan o abona créditos extra y registra la operación en el historial.

---

### User Story 5 - Registro de audiencia y estado para análisis de producto (Priority: P3)

Cada registro conserva de forma estructurada el segmento de audiencia del usuario, su organización y sus solicitudes de membresía, permitiendo consultar métricas agregadas de audiencia (cuántos registros hay por segmento y tasa de completitud de onboarding) sin mezclar datos privados entre organizaciones.

**Why this priority**: Permite al equipo conocer qué audiencia adopta más la plataforma pública para priorizar producto y ventas/universidades.

**Independent Test**: Se puede probar consultando el esquema y las consultas de organización/perfil tras varios registros de distintos segmentos, verificando que los datos se almacenan correctamente y están protegidos por políticas de aislamiento por usuario/organización.

**Acceptance Scenarios**:

1. **Given** múltiples cuentas creadas con distintos segmentos de audiencia, **When** se consultan los registros desde el entorno administrativo de datos, **Then** cada perfil y organización refleja fielmente el segmento seleccionado y su historial de créditos y onboarding.
2. **Given** un usuario autenticado normal, **When** intenta consultar perfiles, créditos o solicitudes de membresía de otra organización, **Then** el sistema deniega el acceso manteniendo aislamiento estricto entre organizaciones.

---

### Edge Cases

- **Usuarios existentes antes de esta funcionalidad**: Cuentas creadas previamente en la plataforma no deben quedar bloqueadas ni sin fila de membresía/créditos; las migraciones y la capa de carga deben asignar o hacer backfill seguro de plan y saldo inicial sin romper proyectos existentes.
- **Confirmación de correo pendiente**: Si Supabase Auth tiene activada la confirmación por correo, el segmento seleccionado durante el registro debe viajar en los metadatos del alta y aplicarse automáticamente cuando se crea la cuenta/organización en la base de datos.
- **Acción de IA que falla en proveedores externos**: Si una llamada de IA falla por error de proveedor después de validar créditos, el sistema debe evitar cobrar por un análisis fallido (reembolsando o descontando tras éxito/mediante transacción compensatoria).
- **Concurrencia en consumo de créditos o canje de códigos**: Dos peticiones simultáneas no pueden dejar el saldo en negativo ni canjear dos veces un código de un solo uso o una recompensa de onboarding.
- **Compatibilidad universitaria (`COMPATIBILIDAD_UNIVERSITARIA.md`)**: La apertura pública con registro DEMO aplica exclusivamente a la plataforma principal Aesteros; las reglas, restricciones de autorregistro de alumnos y acreditación de maestros de las ediciones universitarias no se activan ni se sobrescriben con este flujo público.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El formulario de registro público en `/entrar` (y `/signup` si redirige o comparte componente) MUST requerir que el usuario seleccione su segmento de audiencia (`researcher`, `agency_company`, `teacher`, `student`, `other`) y permitir opcionalmente indicar el nombre de su organización o institución.
- **FR-002**: Al crearse un nuevo usuario en la plataforma pública, el servidor MUST crear su organización personal en plan `demo`, persistir su segmento de audiencia y otorgar una dotación inicial estándar de créditos (30 créditos) mediante registro en un historial (*ledger*) de créditos.
- **FR-003**: El servidor MUST rechazar cualquier intento del cliente de fijar un plan distinto de `demo` o un saldo arbitrario durante el registro o la actualización del perfil propio.
- **FR-004**: El sistema MUST aplicar límites estructurales para organizaciones en plan `demo`: máximo 1 proyecto activo, máximo 3 estudios por proyecto (o 3 en total en DEMO) y máximo 15 respuestas completadas por estudio en liga de participantes.
- **FR-005**: El sistema MUST definir costos en créditos para acciones intensivas (p. ej.: análisis IA de estudio = 5 créditos, auditoría SEO en vivo = 10 créditos, análisis visual/web con IA = 5 créditos, sugerencias con IA = 2 créditos) y validarlos/descontarlos atómicamente en el servidor antes o al ejecutar cada acción.
- **FR-006**: Cuando una acción de IA o auditoría en vivo falle por error técnico de proveedor externo sin generar resultado, el sistema MUST reintegrar los créditos reservados en el historial con referencia compensatoria.
- **FR-007**: El workspace MUST mostrar en la barra superior un indicador claro del plan actual (`DEMO` / `PRO` / `ACADÉMICO`) y el saldo de créditos disponible, enlazando al espacio de membresía.
- **FR-008**: El workspace MUST incluir un checklist interactivo de onboarding para usuarios nuevos con al menos 4 misiones verificables (p. ej. completar/confirmar perfil, crear primer proyecto, crear primer estudio y explorar calculadora de muestra o vista de resultados/tour) y una opción explícita para abrir/recorrer un **tour guiado** paso a paso.
- **FR-009**: El sistema MUST gamificar el onboarding otorgando créditos extra (+30 créditos distribuidos por hitos o al completar todas las misiones del checklist) de forma idempotente en servidor, impidiendo reclamar la misma recompensa más de una vez.
- **FR-010**: El sistema MUST ofrecer una ruta dedicada (`/membresia` o `/plan`) que muestre el consumo actual frente a los límites del plan, el historial de movimientos de créditos, planes de crecimiento adaptados al segmento de audiencia del usuario, un formulario para solicitar ascenso/licencia y un formulario para canjear códigos de activación/bono.
- **FR-011**: Las solicitudes de ascenso/licencia y los canjes de códigos MUST persistirse con validación en servidor y aislamiento RLS por organización/usuario.
- **FR-012**: La interfaz debe respetar los principios de `PRODUCT.md` y WCAG AA (contraste adecuado, etiquetas accesibles, soporte para `prefers-reduced-motion` en el tour y animaciones de progreso/gamificación).

### Key Entities *(include if feature involves data)*

- **Profile (Perfil extendido)**: Vinculado al usuario autenticado; almacena nombre, segmento de audiencia seleccionado en el registro (`audience_segment`), organización declarada opcional (`declared_organization`) y estado de preferencia/descarte del onboarding.
- **Organization Plan & Quota (Plan de organización)**: Asociado a `organizations`; define el nivel actual (`demo`, `academic`, `pro`, `enterprise`), fecha de vigencia y límites aplicables.
- **Credit Ledger Entry (Movimiento de créditos)**: Registro inmutable (*append-only*) por organización con cantidad (+ o -), tipo de evento (`initial_demo_grant`, `onboarding_bonus`, `ai_analysis`, `seo_audit`, `visual_ai`, `ai_suggest`, `refund`, `promo_code`, `admin_adjustment`), referencia a entidad/misión y clave de idempotencia.
- **Onboarding Progress (Progreso de onboarding)**: Registro por usuario/organización de las misiones completadas, fecha de completitud de cada misión, si vio el tour guiado y si ya se otorgó la recompensa correspondiente.
- **Membership Request (Solicitud de membresía)**: Registro de intención de crecimiento o licencia enviado por el usuario; incluye organización, segmento de audiencia, tipo de plan o licencia solicitada, mensaje/contexto institucional y estado (`pending`, `contacted`, `approved`, `rejected`).
- **Activation Code (Código de activación/créditos)**: Códigos configurables para activar un plan o abonar créditos adicionales con control de vigencia y usos máximos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% de los nuevos registros públicos capturan y almacenan un segmento de audiencia válido antes de acceder al workspace.
- **SC-002**: Un usuario nuevo puede completar su registro, identificar sus misiones de bienvenida y lanzar el tour guiado en menos de 60 segundos desde su primer ingreso.
- **SC-003**: 100% de las acciones restringidas por plan `DEMO` (proyectos adicionales, estudios adicionales, respuestas por encima del tope y análisis con IA sin saldo) son bloqueadas en servidor incluso si se omiten las validaciones visuales del navegador.
- **SC-004**: El bono de créditos por gamificación de onboarding (+30 créditos) se acredita automáticamente al completar las misiones y resulta imposible duplicarlo bajo peticiones repetidas o concurrentes.
- **SC-005**: La vista de membresía adapta planes y formularios según el segmento del usuario (ámbito académico vs. ámbito comercial/investigación) y registra solicitudes sin errores en 100% de los envíos válidos.

## Assumptions

- No se integra todavía una pasarela de cobro con tarjeta (Stripe/MercadoPago) en esta entrega; el crecimiento de membresía opera mediante planes informativos por perfil, solicitudes guardadas en base de datos y códigos de activación/promoción canjeables, dejando la estructura lista para conectar checkout en el futuro.
- Los valores iniciales sugeridos para `DEMO` (30 créditos iniciales, +30 por onboarding, 1 proyecto, 3 estudios, 15 respuestas por estudio) se centralizan en configuración tipada en servidor para poder ajustarse fácilmente sin reescribir la lógica.
- Las ediciones universitarias futuras conservarán su propio flujo de alta restringida conforme a `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`, sin activar el autorregistro público abierto de alumnos en esos destinos.
