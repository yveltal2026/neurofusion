import type { Category } from "./types";

export interface RuleDef {
  category: Category;
  element: string;
  /** Importancia para la puntuación (1–3). */
  weight: 1 | 2 | 3;
  /** Recomendación estándar, útil aun sin IA. */
  advice: string;
}

/** Catálogo de reglas. Cambiar pesos o reglas = nueva ENGINE_VERSION. */
export const RULES = {
  "robots.reachable": { category: "rastreo", element: "robots.txt", weight: 2, advice: "Publica /robots.txt con respuesta 200 y declara ahí tus sitemaps." },
  "robots.sitemap_declared": { category: "rastreo", element: "robots.txt · Sitemap", weight: 2, advice: "Agrega una línea «Sitemap: https://…/sitemap.xml» en robots.txt." },
  "robots.blocks_all": { category: "rastreo", element: "robots.txt · Disallow", weight: 3, advice: "Quita «Disallow: /» para los buscadores; bloquea sólo rutas privadas o duplicadas." },
  "sitemap.reachable": { category: "rastreo", element: "sitemap.xml", weight: 2, advice: "Asegura que cada sitemap declarado responda 200 con XML válido." },
  "sitemap.freshness": { category: "rastreo", element: "sitemap · lastmod", weight: 1, advice: "Genera el sitemap automáticamente e incluye <lastmod> real de cada URL." },
  "https.redirect": { category: "seguridad", element: "http → https", weight: 2, advice: "Redirige con 301 toda petición http:// a su equivalente https://." },
  "page.reachable": { category: "indexacion", element: "Respuesta HTTP", weight: 3, advice: "Las URLs que quieres posicionar deben responder 200." },
  "page.redirect_chain": { category: "rastreo", element: "Redirecciones", weight: 1, advice: "Evita cadenas: enlaza y redirige directamente a la URL final." },
  "page.response_time": { category: "rendimiento", element: "Tiempo de respuesta", weight: 1, advice: "Reduce el tiempo del servidor (caché, CDN, consultas lentas)." },
  "page.noindex": { category: "indexacion", element: "meta robots / X-Robots-Tag", weight: 3, advice: "Quita noindex de las páginas que deben aparecer en buscadores." },
  "page.nofollow": { category: "indexacion", element: "meta robots · nofollow", weight: 1, advice: "Evita nofollow a nivel de página: impide que el buscador siga tus enlaces internos." },
  "title.present": { category: "contenido", element: "<title>", weight: 3, advice: "Un título único de 30–60 caracteres con la intención de búsqueda principal al inicio." },
  "meta.description": { category: "contenido", element: "meta description", weight: 2, advice: "Descripción única de 70–160 caracteres que invite al clic." },
  "keyword.usage": { category: "contenido", element: "Palabra clave objetivo", weight: 2, advice: "Incluye la palabra clave objetivo en el título, el H1 y la descripción de forma natural." },
  "canonical": { category: "indexacion", element: "link rel=canonical", weight: 2, advice: "Declara una URL canónica absoluta en cada página indexable." },
  "h1": { category: "estructura", element: "H1", weight: 2, advice: "Exactamente un H1 que describa el contenido principal." },
  "headings.hierarchy": { category: "estructura", element: "Jerarquía de encabezados", weight: 1, advice: "No saltes niveles (H1 → H2 → H3)." },
  "html.lang": { category: "internacional", element: "<html lang>", weight: 1, advice: "Declara el idioma, p. ej. <html lang=\"es-MX\">." },
  "viewport": { category: "movil", element: "meta viewport", weight: 2, advice: "Agrega <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">." },
  "structured_data": { category: "datos_estructurados", element: "JSON-LD schema.org", weight: 2, advice: "Agrega JSON-LD válido (Organization, WebSite, Product, BreadcrumbList… según la página)." },
  "open_graph": { category: "social", element: "Open Graph", weight: 1, advice: "Define og:title, og:description y og:image para que los enlaces compartidos se vean bien." },
  "hreflang": { category: "internacional", element: "hreflang", weight: 1, advice: "Cada versión debe referirse a sí misma y a sus alternas, más x-default." },
  "images.alt": { category: "imagenes", element: "Texto alternativo", weight: 1, advice: "Describe cada imagen informativa con alt; usa alt=\"\" sólo en decorativas." },
  "content.thin": { category: "contenido", element: "Cantidad de texto", weight: 1, advice: "Las páginas con muy poco texto rara vez posicionan; amplía el contenido útil." },
  "mixed_content": { category: "seguridad", element: "Contenido mixto", weight: 1, advice: "Carga todos los recursos por https://." },
  "site.duplicate_titles": { category: "contenido", element: "Títulos duplicados", weight: 2, advice: "Cada URL indexable necesita un título distinto." },
  "site.duplicate_descriptions": { category: "contenido", element: "Descripciones duplicadas", weight: 1, advice: "Cada URL indexable necesita una descripción distinta." },
  "site.broken_links": { category: "enlaces", element: "Enlaces internos rotos", weight: 2, advice: "Corrige o elimina los enlaces internos que devuelven 4xx/5xx." },
  "site.redirected_links": { category: "enlaces", element: "Enlaces a redirecciones", weight: 1, advice: "Actualiza los enlaces internos para que apunten a la URL final." },
  "perf.score": { category: "rendimiento", element: "Lighthouse · rendimiento", weight: 2, advice: "Atiende las oportunidades de mejora de PageSpeed (imágenes, JS, render)." },
  "perf.lcp": { category: "rendimiento", element: "LCP", weight: 2, advice: "LCP ≤ 2.5 s: optimiza la imagen o bloque principal y el tiempo del servidor." },
  "perf.cls": { category: "rendimiento", element: "CLS", weight: 2, advice: "CLS ≤ 0.1: reserva espacio para imágenes, anuncios y fuentes." },
  "perf.inp": { category: "rendimiento", element: "INP", weight: 2, advice: "INP ≤ 200 ms: reduce JavaScript en el hilo principal." },
} as const satisfies Record<string, RuleDef>;

export type RuleId = keyof typeof RULES;

export function ruleDef(rule: string): RuleDef | undefined {
  return (RULES as Record<string, RuleDef>)[rule];
}
