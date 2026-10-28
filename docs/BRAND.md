# Marca: FRSKO · familia Neuro

NeuroFusion es la división de neuromarketing de FRSKO. Se rige por el **Manual de marca FRSKO v4.1** (octubre de 2026),
guardado en [`brand/FRSKO_Manual_de_Marca_v4_1.html`](../brand/FRSKO_Manual_de_Marca_v4_1.html) (sustituye al v3.7, que se conserva
sólo como referencia histórica). Esta guía resume lo que ya aplica el código; ante cualquier duda manda el manual.

## Qué cambió del v3.7 al v4.1

- **Logo con la ola en la s.** Tamaños mínimos nuevos: completo desde **140 px**, sin palabra de 96 a 139 px, la **s con su ola** por debajo de 96 px
  (nunca menos de 24 px). Sustituye a «fko». La palabra «neuro» va ahora en una píldora del color de la familia.
- Frase de cierre: **«Marketing que se nota.»** (antes «Mercadotecnia fresca.»).
- **Onda** como borde entre secciones (dos crestas por pantalla, nunca más) y token `espuma` `#D9F7EF`.
- Patrones nuevos para Start y Leadgen (no aplican a Neuro, que conserva «Resonancia»).

## Predominancia de Neuro

NeuroFusion es producto de la familia Neuro, así que su color manda en la interfaz. El manual reserva a las submarcas las burbujas y los
acentos pequeños; aquí se amplía a lo funcional **sin romper sus reglas duras**: las letras del logo nunca se tiñen, el texto va siempre en color
sólido, sobre un degradado de Neuro no se escribe (el texto va sobre teal con resplandor) y los degradados sólo viven en fondos, bandas y filos.

| Dónde | Cómo |
| --- | --- |
| Acción (`--primary`) | Botón principal, selección, barras de progreso, foco, interruptores: morado `#8511C9` en claro, lila `#B57BEA` en profundo |
| Texto de acento (`--neuro-ink`) | Pestaña activa, enlaces de acento, etiquetas (`Tag`): morado en claro, lila `#DDC2F7` en profundo |
| Superficies | `bg-neuro-wash` / `bg-neuro-tint` (Neuro mezclado con el fondo, 7% y 14%): encabezados de tabla, estados vacíos, iconos |
| Encabezado de la app, portada y acceso | Modo profundo: `bg-profundo` / `bg-resplandor` (teal con Neuro por la esquina superior derecha) y `WaveEdge`, con un filo en degradado de Neuro |
| Iconos | La burbuja de cada icono es `--neuro` |
| Gráficas | La serie 1 es Neuro (`--chart-1`); el azul pasó a la serie 6 |
| Fondo de página | Líquido de Neuro muy tenue en las esquinas (`body::before`) |

El corredor del participante **no** cambia: su pantalla sigue neutra (acento teal/crema) para que nada lo distraiga.

## Logo

- Siempre se usa el archivo oficial, nunca texto en una tipografía. Archivos en `public/brand/` (claro y `_fondo_oscuro`): `frsko_neuro.svg`
  (completo), `frsko_neuro_sin_palabra.svg` y `frsko_neuro_s_ola.svg`. Componente: `src/components/brand/logo.tsx`, que elige la versión por
  ancho; `tone="deep"` fuerza la de fondo teal (encabezados y portadas).
- Los SVG se generaron del manual v4.1 (trazos de las letras y la ola, y la palabra «neuro» convertida a curvas en Poppins Bold).
- Zona de respeto: nada a menos del diámetro de la burbuja grande. No se recolorea, deforma, gira, ni se le agregan burbujas, sombras o contornos.
  Nunca se encierra la s con su ola en un círculo o insignia.
- **Pendiente:** el favicon sigue siendo el de Next; falta el paquete oficial con la s y su ola (SVG, ICO, PNG) de la carpeta de aplicaciones.

## Color (`src/app/globals.css`)

| Token | Claro | Profundo | Uso |
| --- | --- | --- | --- |
| `--background` | `#F6F4EC` crema | `#062E30` | Fondo (60%) |
| `--heading` | `#0A4A4C` teal | `#F6F4EC` | Títulos, letras, botones secundarios |
| `--foreground` | `#17363A` tinta | `#DCE9E4` | Texto corrido |
| `--primary` | `#8511C9` | `#B57BEA` | Acción (texto del botón: crema 6.5:1 / teal oscuro 4.9:1) |
| `--neuro` / `--neuro-soft` | `#8511C9` / `#B57BEA` | `#B57BEA` / `#DDC2F7` | Familia Neuro: burbujas, iconos, series |
| `--neuro-ink` | `#8511C9` | `#DDC2F7` | Morado como texto o borde (6.5:1 sobre crema, 7.2:1 sobre blanco) |
| `--control` | `#A755D4` | `#9A7FBA` | Borde de campos (3.9:1 y 4.2:1; WCAG 1.4.11 pide 3:1) |
| `--deep` / `--on-deep` | `#0A4A4C` / `#F6F4EC` | `#041F21` | Franjas profundas |
| `--mint` | `#2EE0BE` | `#2EE0BE` | Acento menta (≤10%); nunca texto sobre claro |
| `--success` `--warning` `--danger` | `#0B7A5B` `#9A6400` `#C2412D` | `#5BE0B4` `#F8C766` `#FF9A85` | Sólo mensajes de sistema |

Reglas que no se rompen:

- **El morado sobre fondo profundo teal sólo pasa como lila** (`--neuro-on-deep` `#DDC2F7`, 6.3:1): `#8511C9` sobre teal da 1.4:1. Dentro de
  `bg-profundo` y `bg-resplandor` los tokens ya se reescriben solos.
- La menta nunca es texto sobre fondo claro. Un solo botón principal por pantalla; el secundario es de contorno.
- Los colores de estado van acompañados de texto o ícono (el `Alert` lleva burbuja + texto en tinta).
- El corredor del IAT (`src/tools/iat/runner/Runner.tsx`) sobrescribe `--primary` por estudio y en modo neutro lo fija a `--heading`.

## Iconos

Familia propia del manual (cap. 13), en `src/components/brand/icon.tsx`: lienzo de 40 × 40, trazo de 2, extremos y uniones redondos, sin relleno
salvo **una** burbuja por icono (en el color de la familia: Neuro). El trazo toma el color del texto (`text-heading`: teal en claro, crema en profundo). No se mezclan otras
familias (nada de lucide, emojis ni ilustraciones de banco). Para añadir uno, dibújalo con la misma construcción en `GLYPHS`.

- `IconTile` (icono sobre base de Neuro al 15 %): filas y tarjetas. `StatTile`: cifra destacada con icono. `EmptyState`: estado vacío con su siguiente paso.
- Cada herramienta tiene su icono en `src/tools/registry.ts` (`icon`); las pestañas de estudio llevan el suyo en `study-tabs.tsx`.
- Decorativos: `aria-hidden`. Si un icono es el único contenido de un control, pasa `title`.

## Tipografía

Poppins (títulos 700/800, etiquetas y botones 600, cifras) y Plus Jakarta Sans (texto, 16 px, interlínea 1.6), cargadas con
`next/font` en `src/app/layout.tsx`. Máximo tres pesos por pieza. Mayúsculas y espaciado normales: nada de `uppercase`/`tracking-wide` en etiquetas ni encabezados de tabla (usa `font-display font-semibold`).

## Forma y movimiento

- Tarjetas **18 px** (`rounded-lg`), campos **12 px** (`rounded-md`), botones y etiquetas en píldora (`rounded-full`).
- Burbujas: círculos perfectos, color plano, suben de abajo-izquierda a arriba-derecha y se hacen más pequeñas; tres tamaños en
  proporción 1 · 0.7 · 0.5 (`src/components/brand/bubbles.tsx`). En la app: efervescencia **1** (2 a 3 burbujas en una esquina) en
  portada y acceso; **0** (ninguna) en pantallas de trabajo, tablas y reportes.
- Ondas: `WaveEdge` (`src/components/brand/wave.tsx`) entre la franja profunda y el contenido; una por pantalla.
- Patrón «Resonancia» (`public/brand/motivo_*.svg`): sólo como protagonista de una portada, con aire alrededor; nunca detrás de texto.
- Movimiento «tranquilo»: entradas de 0.75 s con la curva *entrar* `cubic-bezier(.16,1,.3,1)`; respeta `prefers-reduced-motion`.

## Voz

Cercana, directa, con datos; sin promesas sin cifra. Frase de marca institucional: «Marketing que se nota.». Idea de la familia Neuro:
«Evidencia sobre cómo decide la gente.».

## Pantallas del participante (liga compartida)

Quien recibe una liga ve una sola jerarquía, definida en `src/components/participant/index.tsx`. Cada cosa distinta se ve distinta:

| Pieza | Para qué |
| --- | --- |
| `ParticipantScreen` | Marco de pantalla: marca discreta arriba (decorativa) y una columna legible (36 rem; 48 rem con imágenes) |
| `ScreenHeader` | Icono, etiqueta de contexto («Parte 2 de 3», con burbuja Neuro), título de 30–36 px y frase de apoyo de 18 px |
| `Section` | Bloque con su propio encabezado (Poppins 20 px): «Antes de empezar», «Consentimiento informado», «Tu privacidad»… |
| `Prose` / `ReadingPanel` | Textos largos (consentimiento) en párrafos separados, sobre una superficie propia |
| `FactList` | Qué esperar, una línea con icono por dato |
| `Callout` | Indicaciones para responder («Cómo responder»), con fondo Neuro y título |
| `QuestionCard` | Una pregunta = una tarjeta: número, enunciado (Poppins 18 px) y respuestas; opciones de 56 px de alto |
| `ConsentCheck` | Casilla de aceptación en tarjeta completa, y botón principal grande (`Button size="lg"`, 56 px) |
| `StatusScreen` | Mensajes de una sola idea: gracias, liga no disponible, error, guardando |

Reglas: el título de una parte nunca nombra el instrumento (SUS, NPS…) porque condicionaría la respuesta; el texto va a 16 px o más; la
acción principal es una sola y va al final (pegada abajo en celular). **Fuera de este kit** quedan los estudios de IAT y sus variantes
(`src/tools/iat/runner`, `src/tools/variants/runner`), que conservan su corredor propio.

## Fuera de alcance (a propósito)

- **Gráficas del análisis IAT** (`src/components/charts/iat-charts.tsx`): usan una paleta basada en Okabe-Ito, apta para daltonismo. La marca A
  usa el morado de Neuro (`--chart-1`) y la B el naranja `#E69F00`: luminancias muy distintas, así que se separan también sin color. El resto
  de las series sigue Okabe-Ito. Sus leyendas ya van en tinta.
- **Gráficas de SEO y Visual** usan los tokens `--chart-1` … `--chart-6` de `globals.css` (validados con el método dataviz en claro y
  oscuro). La posición es fija: el sitio principal siempre es el 1 y el color sigue al sitio en todas las gráficas. En modo profundo
  el contraste de las series contra el teal queda por debajo de 3:1, por eso llevan valores visibles y tabla de datos.
- **Etiquetas de estado** (`src/components/ui/status-badge.tsx`): como el `Alert`, texto en tinta sobre tinte del color de estado con
  un punto; la versión sólida sólo para «Crítico».
- **Estímulo de error del IAT** (la «X» roja) y el acento personalizado por estudio: son parte del método del estudio, no de la identidad.
