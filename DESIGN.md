---
name: Aesteros
description: Plataforma de neuromarketing con precisión táctica y calidez editorial en ámbar, papel neutro y noche profunda.
colors:
  primary: "#ffb000"
  primary-foreground: "#14110c"
  accent-ink: "#7a3e12"
  accent-ink-dark: "#ffca67"
  background: "#f7f7f5"
  surface: "#ffffff"
  surface-muted: "#eeede9"
  sidebar-bg: "#f5efe2"
  foreground: "#1c1917"
  heading: "#14110c"
  muted: "#66635c"
  border: "#e2e0da"
  control: "#a19e96"
  deep: "#0b0907"
  deep-surface: "#201b13"
  on-deep: "#fff7e6"
  success: "#2f6b3f"
  warning: "#885200"
  danger: "#b3261e"
  danger-foreground: "#ffffff"
typography:
  display:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.875rem, 3vw, 2.375rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 110"
  headline:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0em"
rounded:
  md: "12px"
  lg: "18px"
  panel: "26px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.heading}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.danger-foreground}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "44px"
  card-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "20px"
  status-badge:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Aesteros

## Overview

**Creative North Star: "El Estudio de Campo"**

Aesteros es una herramienta táctica, calmada y estructurada para diseñar, proyectar y analizar estudios de neuromarketing. Su lenguaje visual equilibra el rigor analítico con una calidez editorial discreta: superficies limpias en papel neutro para el trabajo diario, una barra lateral en arena cálida con translucidez sutil para orientar al investigador, y un acento en ámbar editorial reservado exclusivamente para acciones clave y señales de inteligencia artificial.

El sistema distingue dos escenas de uso con necesidades opuestas. En el espacio del investigador predomina la claridad operativa, la legibilidad a distancia (al proyectar en aula) y la jerarquía nítida mediante bordes finos y elevación mínima al interactuar. En las pantallas de participante desaparece cualquier adorno o efecto translúcido para proteger la concentración y la validez de las mediciones.

**Key Characteristics:**
- Paleta dual (`modo-claro` y `modo-profundo`) persistida por cookie en servidor sin parpadeo inicial.
- Tipografía variable única (`Archivo`) con cifras tabulares en tablas, fechas y métricas.
- Capas translúcidas reservadas a la navegación lateral y paneles fuera del marco operativo; tarjetas sólidas limpias en el lienzo principal.
- Estados y evidencias siempre accesibles mediante texto, punto/forma y color combinados.

## Colors

La paleta parte de neutros cálidos y papel neutro para sostener sesiones largas de análisis, reservando el ámbar editorial y el café tostado para la acción y el contraste de foco.

### Primary
- **Ámbar Editorial** (`primary`): Acento principal de marca. Se usa en botones de acción primaria, barras de progreso, selección de texto (`::selection`) y marcas de predicción o síntesis de IA.
- **Tinta sobre Ámbar** (`primary-foreground`): Texto e iconos sobre fondos ámbar para asegurar contraste WCAG AA+.
- **Café Tostado** (`accent-ink`) / **Ámbar Claro** (`accent-ink-dark`): Acento tipográfico y color del anillo de foco (`:focus-visible`) en modo claro y modo profundo respectivamente.

### Neutral
- **Papel Neutro** (`background`): Lienzo base del espacio de trabajo en modo claro, pensado para reducir fatiga visual y separar tarjetas blancas sin ruido.
- **Blanco Puro** (`surface`): Superficie de tarjetas, diálogos e inputs en modo claro.
- **Piedra Suave** (`surface-muted`): Contenedores de píldoras de filtro, enlaces activos secundarios y pistas de barra de progreso.
- **Arena Cálida** (`sidebar-bg`): Fondo exclusivo de la barra lateral de navegación en modo claro; ancla la identidad cálida del sistema frente al lienzo neutro.
- **Tinta Oscura** (`heading`) y **Grafito Cálido** (`foreground`): Títulos y texto principal en modo claro.
- **Ceniza Cálida** (`muted`): Metadatos, subtítulos, etiquetas de tabla y fechas.
- **Filete Neutro** (`border`) y **Borde de Control** (`control`): Divisores de sección, contornos de tarjeta y bordes de campos de formulario.
- **Noche Profunda** (`deep`), **Ébano Cálido** (`deep-surface`) y **Crema Clara** (`on-deep`): Fondo, tarjetas y texto del modo profundo y de los respaldos de diálogo (`backdrop`).

### Semantic
- **Verde Bosque** (`success`): Estudios publicados y métricas positivas.
- **Ámbar Alerta** (`warning`): Estados cerrados o advertencias operativas.
- **Carmesí** (`danger` / `danger-foreground`): Acciones destructivas irreversibles y errores críticos.

### Named Rules
**The Accent Scarcity Rule.** El ámbar editorial (`primary`) se reserva para el CTA principal de cada vista, la barra de progreso activa y los indicadores de IA; nunca se usa como fondo de secciones completas ni como adorno repetido.

**The Calm Participant Rule.** Las vistas de participante y los modos de impresión anulan efectos translúcidos y resplandores, manteniendo superficies opacas y de alto contraste.

## Typography

**Display Font:** Archivo (con respaldo Helvetica Neue, Arial, sans-serif)
**Body Font:** Archivo (con respaldo Helvetica Neue, Arial, sans-serif)

**Character:** Fuente variable geométrica con personalidad editorial técnica; su eje de ancho (`font-stretch: 110%`) otorga presencia a los encabezados de página sin perder compacidad en tablas y controles.

### Hierarchy
- **Display** (800, `clamp(1.875rem, 3vw, 2.375rem)`, `1.1`, `font-stretch: 110%`): Títulos principales de página (`.page-title`).
- **Headline** (700, `1.25rem`, `1.25`, `-0.02em`): Encabezados de tarjeta de proyecto y diálogos.
- **Title** (600, `1.125rem`, `1.35`, `-0.01em`): Títulos de sección (`Estudios`, `Baterías`) y tarjetas de estudio.
- **Body** (400, `1rem`, `1.55`, `0em`): Texto corrido y descripciones.
- **Label** (600, `0.8125rem`, `1.5`, `0em`): Metadatos, badges, botones de filtro y encabezados de columna.

### Named Rules
**The Tabular Data Rule.** Todas las tablas, listas de definición (`dl`) y fechas (`time`) aplican `font-variant-numeric: tabular-nums` para que los conteos de participantes y métricas se alineen verticalmente.

## Layout

El espacio de trabajo utiliza una retícula de dos columnas en escritorio (`14.5rem` para la barra lateral fija `sticky` a `100dvh`, y `minmax(0, 1fr)` para el área principal) a partir de `1024px` (`lg`). En pantallas menores, la barra lateral colapsa a una cabecera superior con menú accesible por teclado.

Las galerías de proyectos se organizan en cuadrícula adaptable (`1` → `2` columnas en `md` → `3` columnas en `xl`, separación `16px`), mientras que las galerías de estudios usan `2` columnas en `md` para dar espacio a las barras de progreso y metadatos. El ritmo vertical entre bloques principales alterna `24px` (`space-y-6`) y `32px` (`space-y-8`).

## Elevation & Depth

El sistema combina capas translúcidas en la barra lateral del investigador (`backdrop-filter: blur(20px) saturate(140%)`) con tarjetas sólidas limpias en el lienzo principal. En reposo, la mayoría de las superficies se definen por borde (`1px solid`) y contraste tonal; las tarjetas interactivas de galería añaden una sombra cálida muy difusa que se intensifica sutilmente al pasar el cursor.

### Shadow Vocabulary
- **Card Ambient** (`0 14px 34px -22px rgba(122, 62, 18, 0.22)`): Profundidad cálida en reposo para tarjetas de galería de proyectos y estudios.
- **Card Hover** (`0 18px 40px -22px rgba(122, 62, 18, 0.30)`): Respuesta sutil de elevación al hacer hover sobre una tarjeta clicable.
- **Glass Panel** (`0 22px 46px -28px rgba(20, 17, 12, 0.14)`): Sombra de paneles translúcidos fuera del marco de trabajo sólido.

### Named Rules
**The Solid Canvas Rule.** Dentro de `.workspace-frame`, `.glass-panel` desactiva el `backdrop-filter` para evitar desenfoques superpuestos sobre tablas y formularios densos; la translucidez permanece exclusivamente en la barra lateral.

## Shapes

El lenguaje de formas combina controles completamente redondeados para la acción y la búsqueda con radios progresivos según la jerarquía del contenedor:
- **Controles de acción, badges, filtros y buscadores**: Píldora completa (`9999px`).
- **Inputs y textareas de formulario, enlaces de navegación lateral**: Curva media (`12px`).
- **Tarjetas de galería y paneles**: Curva amplia (`18px`).
- **Contenedores `Card` y paneles destacados**: Curva de panel (`26px`).

## Components

### Buttons
Táctiles, con altura mínima garantizada de `44px` (`h-11` / `min-h-11`), tipografía semibold (`15px`) y micro-compresión al pulsar (`scale(0.97)` desactivada bajo `prefers-reduced-motion`).
- **Shape:** Píldora completa (`9999px`).
- **Primary:** Fondo ámbar editorial (`primary`), texto tinta oscura (`primary-foreground`), padding horizontal `20px`. Hover mediante `brightness(0.95)`.
- **Secondary:** Fondo transparente con borde de `2px` en `heading` y hover al `10%` de opacidad.
- **Ghost / Danger:** Ghost sin borde para acciones secundarias o de cierre; Danger en fondo carmesí (`danger`) exclusivo para confirmaciones destructivas.

### Chips & Filter Pills
- **Style:** Agrupadas dentro de un riel redondeado (`rounded-full`) con fondo `surface-muted` al `75%` y borde sutil.
- **State:** Cada píldora mantiene `min-h-10` (`40px`), `aria-pressed`, fondo sólido `surface` con sombra sutil cuando está activa y texto `muted` en reposo.

### Cards / Containers
- **Corner Style:** `18px` en tarjetas de galería (`ProjectList`, `StudyGallery`) y `26px` en `Card`.
- **Background:** `surface` sólido con borde `1px` en `border`.
- **Shadow Strategy:** Sombra cálida difusa en tarjetas interactivas, con transición de borde hacia `accent-ink` en hover.
- **Internal Padding:** `20px` (`p-5`).

### Inputs / Fields
- **Style:** Altura mínima `44px`, fondo `surface`, borde `1px` en `control`, radio `12px` (o `9999px` en buscadores con hint `⌘K`).
- **Focus:** Cambio de borde a `accent-ink` con anillo exterior (`2px`) semitransparente.

### Status Badges
- **Style:** Píldora compacta (`rounded-full`, padding `2px 10px`) con borde tintado, fondo suave, punto indicador (`6px`) y etiqueta en tinta legible (`foreground`). Nunca dependen únicamente del color.

### Navigation & Rows
- **Sidebar Links:** `min-height: 40px`, radio `12px`, estado activo sólido en `heading` con texto invertido (`background`) y peso `700`.
- **RowLink:** Filas separadas por filetes (`divide-y`), fondo `neuro-wash` al pasar el cursor, flecha a la derecha y metadatos visibles tanto en escritorio como debajo del título en pantallas estrechas (`< sm`).

## Do's and Don'ts

### Do:
- **Do** mantener una altura mínima de `40px–44px` en botones, inputs y píldoras de filtro para garantizar accesibilidad táctil y proyección en aula.
- **Do** combinar siempre color + texto + punto o icono en estados (`StatusBadge`) y métricas de estudio.
- **Do** exigir confirmación explícita por nombre en un diálogo modal antes de ejecutar borrados irreversibles (`DeleteProjectDialog`).
- **Do** incluir una acción primaria directa dentro de cada `EmptyState` para guiar el siguiente paso sin reescanear la página.

### Don't:
- **Don't** usar `backdrop-filter` ni efectos de resplandor en pantallas de participante o vistas de impresión.
- **Don't** usar el color ámbar (`primary`) como fondo decorativo de tarjetas o secciones enteras; resérvalo para acciones primarias y señales de IA.
- **Don't** ocultar metadatos de estado (`StatusBadge`) en pantallas pequeñas (`< sm`) dentro de listas de filas.
- **Don't** introducir tipografías externas ni omitir `motion-reduce:transition-none` en transiciones interactivas.
