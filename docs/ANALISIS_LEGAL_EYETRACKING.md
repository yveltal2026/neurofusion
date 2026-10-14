# Análisis de cumplimiento: eye tracking con webcam y pruebas en universidades

Fecha: 2026-10-14 · Estado: **borrador de trabajo para el equipo legal de FRSKO**. Lo elaboró Claude con la herramienta de revisión de cumplimiento (`legal:compliance-check`). **No es asesoría legal**: es un insumo para que el equipo legal valide, corrija o rechace. Ninguna liga con cámara o mirada se abre a participantes reales sin esa validación (decisión 4 de [`ROADMAP_MODULOS.md`](ROADMAP_MODULOS.md)).

## 0. Alcance, supuestos y límites de este análisis

**Qué se evaluó:** el módulo de eye tracking con webcam descrito en [`EYETRACKING-DECISION.md`](EYETRACKING-DECISION.md) y su uso en estudios con participantes universitarios (licenciatura y posgrado), eventualmente con clientes finales.

**Supuestos dados por el equipo:**
- Todos los participantes son mayores de 18 años.
- El video se procesa **sólo en el dispositivo** del participante; al servidor llegan coordenadas normalizadas de mirada, marcas de tiempo y métricas de calidad de calibración.
- La IA (Anthropic/OpenAI) recibe únicamente agregados ya calculados, nunca filas crudas ni datos personales.

**Lo que se revisó en el repositorio** (estado de `main`):
- La tabla `sessions` guarda: `participant_ref`, `demographics` (edad y género si el estudio los pide), `explicit_preference`, `consent_version`, `input_mode`, `device_type`, `screen_width/height`, `user_agent` (≤ 500 caracteres), `device_id` (UUID de una cookie firmada `httpOnly`) e `ip_hash` (hash con sal por estudio; la IP no se guarda en claro).
- El texto de consentimiento por defecto (`defaultConsentText`, `src/tools/iat/config.ts`) describe una prueba de clasificar palabras y dice que la participación es «**voluntaria y anónima**». **No menciona cámara ni mirada.** El consentimiento es una sola casilla; sí se guarda su versión.

**Límites de este análisis (importantes):**
1. **No pude abrir el texto oficial** de la ley (el sitio de la Cámara de Diputados no fue accesible desde este entorno). Lo que digo de la LFPDPPP 2025 proviene de resúmenes de despachos y blogs, no del DOF. Todo lo marcado **[verificar]** debe confirmarse en el texto oficial.
2. **No hay acceso a documentos internos de FRSKO** (aviso de privacidad vigente, contratos tipo, políticas): los conectores legales no estuvieron disponibles en esta sesión. Si ya existen, deben cotejarse contra este análisis.
3. No se revisó ninguna normativa de universidades concretas. Cada institución puede tener requisitos propios.

## 1. Resumen

**Veredicto: proceder con condiciones.**

- **IAT y cuestionarios** (lo que ya existe): se pueden usar en las pruebas escolares con **correcciones menores de texto** (en particular dejar de llamar «anónima» a la participación; ver R-02) y con aviso de privacidad y definición de roles.
- **Eye tracking**: **no abrir a participantes reales** hasta cumplir las condiciones 1–6 de §6. El mayor riesgo no es la ley en abstracto sino que **la promesa «el video no sale del dispositivo» sea verificable técnicamente** y esté bien dicha al participante.
- La ausencia de menores simplifica el análisis, pero hay que garantizar el filtro de edad (R-07).

## 2. Marcos aplicables

| Marco | Relevancia | Qué exige (resumen) |
|---|---|---|
| **LFPDPPP (México, nueva ley publicada en el DOF el 20-mar-2025)** [verificar texto vigente: una fuente menciona una reforma del 14-nov-2025] | Aplica a FRSKO como particular que trata datos personales. La autoridad es ahora la Secretaría Anticorrupción y Buen Gobierno (el INAI desapareció). El reglamento nuevo seguía pendiente a mediados de 2026; se aplicaría supletoriamente el de 2011 en lo que no contradiga la ley [verificar] | Aviso de privacidad desde la recolección; consentimiento; derechos ARCO (acceso, rectificación, cancelación, oposición), gratuitos; plazo de respuesta de 20 días [verificar si hábiles o naturales]; medidas de seguridad; contrato con encargados; atención a vulneraciones |
| **Datos personales sensibles (LFPDPPP)** | **Pregunta abierta clave:** si la mirada o datos derivados de la cara se consideran sensibles o biométricos. No pude confirmar la redacción de la definición [verificar] | Si lo fueran: consentimiento expreso y reforzado, aviso que los identifique, deber de minimizar |
| **Instituciones públicas** (UNAM, IPN, universidades estatales, etc.) | Se rigen por la ley para sujetos obligados, no por la LFPDPPP; pueden exigir convenio, comité de ética o validación propia [verificar por institución] | Autorización institucional previa; la universidad es responsable de sus datos |
| **Ética de la investigación** | Muchas universidades exigen aprobación de un comité para estudios con personas, aunque sean de aula | Consentimiento informado, voluntariedad real, protección frente a coerción |
| **GDPR / RGPD** | **No aplica** mientras se reclute sólo a personas en México. Se activaría si se dirige el estudio a personas en la UE o se monitorea su comportamiento allí | Si se activara: base legal, posible DPIA, análisis del art. 9 (biométricos), representante en la UE, mecanismo de transferencia |
| **EE. UU. (leyes estatales de biometría, p. ej. Illinois, Texas, Washington; CCPA)** | **No aplica** sin participantes en EE. UU. Las leyes de biometría de algunos estados tienen litigios activos sobre geometría facial, aun con procesamiento local; el riesgo es alto si se invita a residentes de esos estados [verificar] | Excluir participantes de EE. UU. hasta una revisión específica |

## 3. Análisis de los datos

| Dato | ¿Sale del dispositivo? | Tratamiento recomendado |
|---|---|---|
| Video / fotogramas de la cámara | **No** (condición de diseño) | No grabar, no subir, no guardar capturas ni miniaturas, ni siquiera para depuración |
| Puntos de referencia faciales (landmarks) | **No** | Quedan en memoria del navegador durante la sesión y se descartan |
| Coordenadas de mirada normalizadas + tiempo | Sí | Dato personal seudonimizado, vinculado a `participant_ref`. Tratarlo con **cautela reforzada** (ver abajo) |
| Calidad de calibración (error en puntos de validación, fps) | Sí | Métrica técnica; vinculada a la misma sesión |
| `device_id`, `ip_hash`, `user_agent`, tamaño de pantalla | Sí | Ya existen. Son **seudónimos**, no anonimato |
| Edad, género (opcionales) | Sí | Ya existen. Con grupos pequeños aumentan el riesgo de reidentificación |

**Por qué conviene tratar la mirada con cautela reforzada**, aunque no se use para identificar a nadie:
- Las trayectorias de mirada, junto con el resto de la sesión, pueden **reidentificar** en grupos pequeños (20–40 estudiantes de un salón con edad y género) y existe investigación sobre biometría por movimiento ocular.
- El movimiento ocular puede **revelar indirectamente información de salud** (p. ej. ciertas condiciones visuales o neurológicas), aunque la plataforma no pretenda inferirla.
- La mejor práctica es la contraria a la de los productos que infieren emoción: **no inferir identidad, emociones, salud ni atributos personales** a partir de la cara o la mirada, y decirlo en el consentimiento.

**Conclusión provisional (a validar por legal):** los datos de mirada **probablemente no son «biométricos» en sentido estricto** si no se usan para identificar a una persona, pero deben tratarse **como si exigieran consentimiento expreso y específico**, porque el costo de hacerlo es bajo y el de equivocarse es alto.

## 4. Riesgos y hallazgos

| ID | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R-01 | El consentimiento actual no menciona cámara ni mirada. Usarlo para eye tracking sería consentimiento no informado | **Alta** | Consentimiento **específico y separado** para cámara y mirada (borrador en §7), con versión propia en `consent_version` |
| R-02 | El texto actual dice «voluntaria y **anónima**». Con `device_id`, `ip_hash`, `user_agent`, demográficos y (en el futuro) mirada, la participación es **seudónima/confidencial**, no anónima. Afirmarlo puede ser una declaración inexacta ante el participante | **Alta** (corrección sencilla) | Cambiar a «confidencial: no te pedimos nombre ni correo y tus respuestas se analizan de forma agregada». Revisar también la ficha del README |
| R-03 | «El video no sale del dispositivo» debe ser **verdad técnica**. Hay dos fugas típicas: (a) cargar el modelo o el WASM desde una CDN de terceros (el tercero recibe la IP del participante); (b) enviar fotogramas por error en depuración o telemetría | **Alta** | Servir modelo y WASM desde el propio dominio (WebEyeTrack ya exige copiar sus pesos a `public/`; MediaPipe por defecto usa CDN: configurarlo local); política CSP con `connect-src` restringido; **prueba E2E que falle si algún request lleva imagen o video**; sin analítica de terceros en la ruta del participante |
| R-04 | Roles no definidos (quién es responsable y quién encargado) en escuela y cliente final | **Alta** | Ver §5; contrato o convenio antes de cada piloto |
| R-05 | **Escuelas públicas** como sujetos obligados con régimen propio | Media–alta | Preguntar el tipo de institución antes de comprometerse; convenio y, si lo piden, comité de ética |
| R-06 | **Coerción en el aula**: si el profesor evalúa y recluta, la voluntariedad se pone en duda | Media | Participación sin efecto en calificaciones; actividad alternativa equivalente; el docente no ve datos individuales; que el reclutamiento lo haga alguien sin relación de evaluación cuando se pueda |
| R-07 | El filtro de edad es una **autodeclaración** («confirmas que eres mayor de edad»). Alumnos de primer semestre pueden tener 17 años | Media | Casilla explícita de «tengo 18 años o más», no sólo texto de lectura; tener claro que no hay verificación de edad y que ligas dirigidas a universitarios no la garantizan; preferir ligas distribuidas por la institución |
| R-08 | Ejercicio de derechos ARCO sin identificar al participante: hoy no hay forma de localizar los datos de una persona | Media | Mostrar al final un **código de participación** que sirva para solicitar acceso o eliminación; procedimiento y responsable designado; plazo de 20 días [verificar] |
| R-09 | Retención sin definir | Media | Definir plazos (ver §8); borrar los datos de mirada en bruto una vez calculados los agregados necesarios, salvo que el estudio requiera conservarlos |
| R-10 | Grupos pequeños + agregados enviados a la IA: un agregado de 20 personas con filtros por edad/género puede reidentificar | Baja–media | Umbral mínimo de celdas (p. ej. no reportar segmentos con < 5 personas) antes de enviar a la IA y en informes |
| R-11 | Transferencias internacionales: Supabase y Vercel (alojamiento), Anthropic/OpenAI (IA) | Baja–media | Confirmar región del proyecto Supabase y firmar o aceptar sus acuerdos de tratamiento de datos (DPA); confirmar términos de la API sobre retención y entrenamiento; mencionarlos en el aviso de privacidad [verificar requisitos de remisión/transferencia en la ley nueva] |
| R-12 | Afirmaciones comerciales sobre precisión del eye tracking sin validación independiente | Media | Etiqueta «indicativo, no validado contra rastreador de laboratorio» en interfaz, informes y ventas (decisión 3 del roadmap) |
| R-13 | Cookie de dispositivo (`device_id`) | Baja | Es estrictamente funcional (candado anti-repetición); declararla en el aviso. Sin requisito específico de cookies en México; sí lo habría para la UE |
| R-14 | Incidente de seguridad con datos de participantes | Media | Procedimiento de respuesta y notificación a titulares y autoridad [verificar condiciones y plazos de la ley nueva]; RLS ya existe; revisar accesos de service role |

## 5. Roles: responsable y encargado

Debe fijarse por escenario y por escrito antes de abrir cualquier liga.

| Escenario | Quién decide fines y medios | Rol propuesto | Documento |
|---|---|---|---|
| **A. FRSKO investiga por cuenta propia** (estudio propio, p. ej. validación interna) | FRSKO | FRSKO es **responsable** | Aviso de privacidad de FRSKO |
| **B. Escuela/docente usa la plataforma para un estudio de su curso o investigación** | La escuela o el docente deciden el propósito | La escuela (o el docente por ella) es **responsable** del estudio; FRSKO actúa como **encargado** del alojamiento y procesamiento. Para los datos de las cuentas de usuario de la plataforma, FRSKO es responsable | Convenio con la escuela + cláusulas de encargado; aviso de privacidad del estudio a nombre de quien sea responsable |
| **C. Cliente final contrata a FRSKO** | El cliente define objetivos; FRSKO define metodología | Normalmente **cliente responsable, FRSKO encargado**; si FRSKO decide libremente la metodología y usa los datos para fines propios, puede ser **corresponsable** | Contrato de servicios con cláusulas de encargado; definir quién publica el aviso |

Puntos a resolver por legal: quién publica el aviso de privacidad que ve el participante; si FRSKO puede reutilizar datos agregados para benchmarks o mejoras del modelo (si sí, hay que decirlo en el aviso y en el contrato); y subencargados (Supabase, Vercel, proveedores de IA).

## 6. Acciones recomendadas (en orden)

1. **Corregir el texto de consentimiento actual** (R-02) y añadir casilla explícita de «tengo 18 años o más» (R-07). Es independiente del eye tracking y puede hacerse ya.
2. **Redactar el aviso de privacidad** (integral y simplificado) para el escenario de las pruebas escolares, con el contenido listado en §9. Lo redacta o valida el equipo legal de FRSKO.
3. **Definir roles y firmar convenio** con cada escuela antes del piloto (§5); averiguar si es institución pública o privada (R-05) y si exige comité de ética.
4. **Consentimiento separado de cámara y mirada** (borrador en §7), con versión propia y alternativa para quien no quiera activar la cámara.
5. **Hacer verificable la promesa técnica** (R-03): modelos y WASM propios, CSP, prueba E2E de ausencia de fotogramas en la red, revisión de código antes de abrir ligas.
6. **Definir retención, código de participación y procedimiento ARCO** (R-08, R-09) y un procedimiento de incidentes (R-14).
7. **Mientras tanto**, las pruebas escolares que **no** usen cámara pueden iniciar con las acciones 1–3.
8. Documentar una **evaluación de impacto interna** (aunque la ley no la exija en este caso [verificar]) con este análisis como base.

## 7. Borrador de consentimiento para cámara y mirada

> Borrador para revisión de legal. No usar sin validación. Ajustar al responsable real del estudio y a los datos de contacto.

**Pantalla previa a la cámara (consentimiento separado del general):**

> **Este estudio usa tu cámara para saber hacia dónde miras en la pantalla.**
>
> **Qué hacemos:** tu navegador usa la cámara para calcular, en tu propio dispositivo, en qué parte de la pantalla estás mirando mientras ves imágenes.
>
> **Qué no hacemos:** no grabamos video ni tomamos fotos. Las imágenes de tu cámara **no salen de tu dispositivo** y se descartan al instante. No intentamos identificarte ni deducir emociones, estado de ánimo, salud ni otras características personales.
>
> **Qué guardamos:** únicamente las coordenadas de dónde miraste en la pantalla, la hora de cada punto y una medida de qué tan bien funcionó la calibración. Estos datos se asocian a un código de participación, no a tu nombre ni a tu correo.
>
> **Cuánto tiempo:** [X meses] para los datos de mirada en bruto; los resultados agregados pueden conservarse por más tiempo.
>
> **Quién los ve:** [equipo de investigación / docente]. Los resultados se muestran agrupados. Se usa un servicio de inteligencia artificial para redactar resúmenes sobre resultados agrupados, sin tus datos individuales.
>
> **Tu decisión:** activar la cámara es **opcional**. Si no quieres, puedes [continuar con la parte del estudio que no la usa / salir sin consecuencia alguna]. No afecta tus calificaciones ni tu relación con [la escuela]. Puedes salir cuando quieras cerrando la ventana.
>
> **Tus derechos:** al terminar te daremos un código de participación. Con él puedes pedir ver, corregir o eliminar tus datos, o oponerte a su uso, escribiendo a [correo del responsable]. Más detalles en el [aviso de privacidad].
>
> ☐ Tengo 18 años o más.
> ☐ He leído lo anterior y **acepto** que se use mi cámara para calcular dónde miro, en las condiciones descritas.
>
> [Continuar y activar la cámara] [No activar la cámara]

**Corrección del consentimiento general** (sustituye la frase de «anónima»):

> «Tu participación es voluntaria y confidencial: no te pedimos nombre ni correo y tus respuestas se analizan de forma agregada.»

Notas de diseño: el permiso del navegador (la ventana «¿permitir cámara?») **no sustituye** este consentimiento; es un control técnico adicional. La casilla de cámara no debe venir marcada. Guardar versión y marca de tiempo del consentimiento de cámara por separado del general.

## 8. Retención (propuesta a validar)

| Dato | Propuesta |
|---|---|
| Video, fotogramas, landmarks | **Ninguna**: no se guardan |
| Mirada en bruto (coordenadas + tiempo) | Plazo corto y definido por estudio (p. ej. hasta cerrar el análisis y como máximo 12 meses), luego borrado o agregación irreversible |
| Métricas agregadas del estudio | Mientras el estudio exista; eliminar al borrar el estudio (el esquema ya tiene `on delete cascade`) |
| `device_id`, `ip_hash`, `user_agent` | Sólo para el candado anti-repetición y depuración de muestra; borrar al cerrar el estudio |
| Registro de consentimiento (versión, marca de tiempo) | Conservar mientras se conserven los datos, como evidencia |

## 9. Contenido mínimo del aviso de privacidad (a redactar por legal)

Identidad y domicilio del responsable; datos que se tratan (incluyendo los de mirada y los técnicos del dispositivo) e identificación de cuáles se consideran sensibles si legal así lo decide; finalidades (investigación y análisis agregado; candado anti-repetición); si hay finalidades secundarias (p. ej. benchmarks) y cómo negarse; encargados y subencargados (alojamiento, IA); remisiones y transferencias, incluidas las internacionales; mecanismos para ejercer ARCO y revocar consentimiento; uso de la cookie de dispositivo; cambios al aviso; autoridad competente. Versión simplificada visible en la pantalla de consentimiento.

## 10. Aprobaciones necesarias

| Quién | Por qué | Estado |
|---|---|---|
| Equipo legal de FRSKO | Validar este análisis, aviso de privacidad, consentimientos, convenios y contratos de encargado | Pendiente |
| Responsable técnico de NeuroFusion | Confirmar y evidenciar que el video no sale del dispositivo (R-03) y los plazos de retención | Pendiente |
| Titular de datos o área jurídica de cada escuela | Convenio, tipo de institución, requisitos propios | Pendiente por escuela |
| Comité de ética o investigación de la escuela, si lo exige | Estudios con personas y uso de cámara | Pendiente por escuela |
| Dirección de FRSKO | Aprobar postura sobre reutilización de datos agregados y alcance comercial | Pendiente |

## 11. Revisión especializada recomendada

- Texto oficial vigente de la LFPDPPP y su reglamento: definición de datos sensibles, requisitos de consentimiento expreso, plazos ARCO, vulneraciones, remisiones/transferencias, evaluaciones de impacto.
- Si algún día se invita a participantes de la **UE** o de **EE. UU.** (especialmente Illinois, Texas y Washington): análisis específico antes de abrir ligas.
- Una revisión técnica independiente (pruebas de red) de la afirmación de que no sale video del dispositivo, antes de comunicarla a clientes.

## Fuentes consultadas (secundarias; verificar contra el texto oficial)

- [EY Law Flash: nueva LFPDPPP](https://www.ey.com/content/dam/ey-unified-site/ey-com/es-mx/technical/tax/documents/ey-law-flash-nueva-lfpdppp.pdf)
- [Hogan Lovells: Mexico's new federal data protection law](https://www.hoganlovells.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies)
- [Greenberg Traurig: nueva ley de protección de datos](https://www.gtlaw.com/es/insights/2025/3/nueva-ley-general-proteccion-de-datos)
- [Santos Elizondo: nueva LFPDPPP](https://www.santoselizondo.com/en/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares/)
- [Baker Tilly México: nuevas disposiciones](https://www.bakertilly.mx/en/insights/nuevas-disposiciones-en-materia-de-datos-personales)
- [Sharkit: reglamento pendiente 2026](https://sharkit.mx/nueva-lfpdppp-reglamento-pendiente/)
- Texto oficial a consultar: [Cámara de Diputados, LFPDPPP](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf) (no accesible desde el entorno de esta sesión)
