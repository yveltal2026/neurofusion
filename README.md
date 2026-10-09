# NeuroFusion

Plataforma para diseñar, aplicar y analizar estudios de neuromarketing. V1: módulo **IAT** (Test de Asociación Implícita). Uso educativo/demostrativo hoy; arquitectura pensada para convertirse en SaaS.

## Flujo
1. El investigador crea un **proyecto** (un proyecto puede tener varias herramientas en el futuro).
2. Crea un **estudio IAT**: un wizard le hace las preguntas metodológicas.
3. Se genera una **liga mágica** que comparte con N participantes.
4. Los participantes dan sus datos, hacen el test y reciben un agradecimiento. Sus datos viajan a la base central.
5. El investigador consulta datos crudos (CSV) o pide un **análisis con IA** (conclusiones, gráficas, interpretación).

## Stack
Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres/Auth/RLS) · Zod · Recharts · Vitest · Playwright.

## Desarrollo
```bash
cp .env.example .env.local   # completar variables
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run lint` / `typecheck` | Lint y tipos |
| `npm test` | Pruebas unitarias (motor IAT) |
| `npm run test:e2e` | Pruebas end-to-end (Playwright) |

## Principio de diseño
La matemática del estudio (bloques, D-score, validez, estadísticos) es código determinista y testeado. La IA solo redacta conclusiones sobre números ya calculados y únicamente recibe agregados anónimos.

## Referencia metodológica
Greenwald, A. G., Nosek, B. A., & Banaji, M. R. (2003). Understanding and using the Implicit Association Test: I. An improved scoring algorithm. *Journal of Personality and Social Psychology, 85*(2), 197–216.
