# Marca: FRSKO · familia Neuro

NeuroFusion es la división de neuromarketing de FRSKO. Se rige por el **Manual de marca FRSKO v3.7** (octubre de 2026),
guardado en [`brand/FRSKO_Manual_de_Marca_v3_7.html`](../brand/FRSKO_Manual_de_Marca_v3_7.html) (el PDF equivalente no se
versiona por su peso de 10 MB). Esta guía resume lo que ya aplica el código; ante cualquier duda manda el manual.

## Logo

- Siempre se usa el archivo oficial, nunca texto en una tipografía: `public/brand/frsko_neuro.svg` (modo claro) y
  `public/brand/frsko_neuro_fondo_oscuro.svg` (modo profundo). Componente: `src/components/brand/logo.tsx`.
- Mínimo **120 px** de ancho con la palabra «neuro» (el componente lo fuerza). Zona de respeto: nada a menos del diámetro de la burbuja grande.
- No se recolorea, deforma, gira, ni se le agregan burbujas, sombras o contornos.
- **Pendiente:** faltan las variantes oficiales «sin palabra de abajo» (64 px) y **fko** (24 px, favicon). El favicon sigue siendo el de Next
  hasta recibir `fko`.

## Color (`src/app/globals.css`)

| Token | Claro | Profundo | Uso |
| --- | --- | --- | --- |
| `--background` | `#F6F4EC` crema | `#062E30` | Fondo (60%) |
| `--heading` | `#0A4A4C` teal | `#F6F4EC` | Títulos, enlaces, bordes activos (30%) |
| `--foreground` | `#17363A` tinta | `#DCE9E4` | Texto corrido |
| `--primary` | `#2EE0BE` menta | `#2EE0BE` | Botón principal, acentos, burbujas (≤10%) |
| `--neuro` / `--neuro-soft` | `#8511C9` / `#B57BEA` | `#B57BEA` / `#DDC2F7` | Familia Neuro: burbujas y acentos pequeños |
| `--success` `--warning` `--danger` | `#0B7A5B` `#9A6400` `#C2412D` | `#5BE0B4` `#F8C766` `#FF9A85` | Sólo mensajes de sistema |

Reglas que no se rompen:

- **La menta nunca es texto sobre fondo claro.** Para texto usa `text-heading`, no `text-primary`.
- Un solo botón principal (menta) por pantalla. El secundario es de contorno.
- Los colores de estado van acompañados de texto o ícono (el `Alert` lleva burbuja + texto en tinta).
- El corredor del IAT (`src/tools/iat/runner/Runner.tsx`) sobrescribe `--primary` por estudio. En modo neutro lo fija a
  `--heading` porque `BlockRunner` pinta con `text-primary` los estímulos de concepto y la menta sobre crema no se lee.

## Tipografía

Poppins (títulos 700/800, etiquetas y botones 600, cifras) y Plus Jakarta Sans (texto, 16 px, interlínea 1.6), cargadas con
`next/font` en `src/app/layout.tsx`. Máximo tres pesos por pieza. Nunca frases completas en mayúsculas.

## Forma y movimiento

- Tarjetas **18 px** (`rounded-lg`), campos **12 px** (`rounded-md`), botones y etiquetas en píldora (`rounded-full`).
- Burbujas: círculos perfectos, color plano, suben de abajo-izquierda a arriba-derecha y se hacen más pequeñas; tres tamaños en
  proporción 1 · 0.7 · 0.5 (`src/components/brand/bubbles.tsx`). En la app: efervescencia **1** (2 a 3 burbujas en una esquina) en
  portada y acceso; **0** (ninguna) en pantallas de trabajo, tablas y reportes.
- Patrón «Resonancia» (`public/brand/motivo_*.svg`): sólo como protagonista de una portada, con aire alrededor; nunca detrás de texto.
- Movimiento «tranquilo»: entradas de 0.75 s con la curva *entrar* `cubic-bezier(.16,1,.3,1)`; respeta `prefers-reduced-motion`.

## Voz

Cercana, directa, con datos; sin promesas sin cifra. Frase de marca institucional: «Mercadotecnia fresca.». Idea de la familia Neuro:
«Evidencia sobre cómo decide la gente.».

## Fuera de alcance (a propósito)

- **Gráficas del análisis IAT** (`src/components/charts/iat-charts.tsx`): usan la paleta Okabe-Ito, apta para daltonismo. Cambiarla a
  colores de marca requiere validar contraste y distinción entre series; se decide aparte. Sus leyendas ya van en tinta.
- **Gráficas de SEO y Visual** usan los tokens `--chart-1` … `--chart-6` de `globals.css` (validados con el método dataviz en claro y
  oscuro). La posición es fija: el sitio principal siempre es el 1 y el color sigue al sitio en todas las gráficas. En modo profundo
  el contraste de las series contra el teal queda por debajo de 3:1, por eso llevan valores visibles y tabla de datos.
- **Etiquetas de estado** (`src/components/ui/status-badge.tsx`): como el `Alert`, texto en tinta sobre tinte del color de estado con
  un punto; la versión sólida sólo para «Crítico».
- **Estímulo de error del IAT** (la «X» roja) y el acento personalizado por estudio: son parte del método del estudio, no de la identidad.
