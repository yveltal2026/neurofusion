export type OnboardingMissionId =
  | "profile_confirmed"
  | "first_project"
  | "first_study"
  | "guided_tour_or_sample";

export interface OnboardingMissionDefinition {
  id: OnboardingMissionId;
  title: string;
  description: string;
  rewardCredits: number;
  actionLabel: string;
  actionType: "auto" | "scroll_project" | "open_tour" | "link";
  href?: string;
}

export const ONBOARDING_MISSIONS: readonly OnboardingMissionDefinition[] = [
  {
    id: "profile_confirmed",
    title: "Perfil y espacio DEMO listos",
    description: "Registramos tu perfil de audiencia y activamos tus 30 créditos iniciales.",
    rewardCredits: 5,
    actionLabel: "Completado",
    actionType: "auto",
  },
  {
    id: "first_project",
    title: "Crea tu primer proyecto",
    description: "Agrupa tus estudios por marca, cliente, materia o hipótesis.",
    rewardCredits: 10,
    actionLabel: "Crear proyecto",
    actionType: "scroll_project",
    href: "#nuevo-proyecto",
  },
  {
    id: "first_study",
    title: "Lanza tu primer estudio",
    description: "Elige IAT, encuesta, SEO, análisis visual o eye tracking dentro de tu proyecto.",
    rewardCredits: 10,
    actionLabel: "Explorar herramientas",
    actionType: "link",
    href: "/projects",
  },
  {
    id: "guided_tour_or_sample",
    title: "Completa el tour guiado de Aesteros",
    description: "Conoce en 4 pasos cómo recolectar respuestas, usar créditos IA y crecer tu plan.",
    rewardCredits: 5,
    actionLabel: "Ver tour guiado",
    actionType: "open_tour",
  },
] as const;

export interface TourStep {
  id: string;
  badge: string;
  title: string;
  body: string;
  tip: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export const GUIDED_TOUR_STEPS: readonly TourStep[] = [
  {
    id: "projects",
    badge: "Paso 1 de 4 · Organización",
    title: "Tus investigaciones viven dentro de Proyectos",
    body: "Un proyecto reúne todos los estudios de una misma marca, campaña o clase. En tu cuenta DEMO puedes crear 1 proyecto con hasta 3 estudios.",
    tip: "Tip: usa el nombre de tu campaña, sitio web o materia para encontrar todo al instante.",
  },
  {
    id: "tools",
    badge: "Paso 2 de 4 · Herramientas",
    title: "Elige entre 8 herramientas listas para usar",
    body: "Combina pruebas implícitas (IAT), encuestas estandarizadas, auditoría SEO, análisis visual con IA y eye tracking web o con webcam sin configurar hojas de cálculo.",
    tip: "Las herramientas con participantes generan una liga mágica anónima lista para compartir (hasta 15 respuestas por estudio en DEMO).",
    ctaHref: "/muestra",
    ctaLabel: "Ver calculadora de muestra",
  },
  {
    id: "credits",
    badge: "Paso 3 de 4 · Créditos e IA",
    title: "Duplica tus créditos completando el checklist",
    body: "Inicias con 30 créditos. Solo las acciones intensivas (análisis con IA, sugerencias de estímulos o auditorías SEO en vivo) consumen créditos; si completas el onboarding sumas +30 créditos extra.",
    tip: "Si un análisis falla por red o proveedor externo, el sistema reintegra los créditos automáticamente.",
  },
  {
    id: "membership",
    badge: "Paso 4 de 4 · Membresía",
    title: "Crece tu cuenta según tu perfil",
    body: "En el espacio de Membresía verás tu consumo en tiempo real, tu historial de créditos y opciones pensadas para tu perfil (licencias académicas o planes Pro/Agencia).",
    tip: "También puedes canjear códigos de activación o solicitar ampliación directamente desde ahí.",
    ctaHref: "/membresia",
    ctaLabel: "Ir a Membresía",
  },
] as const;

export function missionRewardTotal(): number {
  return ONBOARDING_MISSIONS.reduce((acc, m) => acc + m.rewardCredits, 0);
}

export function computeOnboardingSummary(completedMissions: readonly string[]) {
  const completedSet = new Set(completedMissions);
  const totalCount = ONBOARDING_MISSIONS.length;
  const completedCount = ONBOARDING_MISSIONS.filter((m) => completedSet.has(m.id)).length;
  const earnedCredits = ONBOARDING_MISSIONS.reduce(
    (sum, m) => (completedSet.has(m.id) ? sum + m.rewardCredits : sum),
    0,
  );
  const maxCredits = missionRewardTotal();
  const remainingCredits = Math.max(0, maxCredits - earnedCredits);
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    completedCount,
    totalCount,
    earnedCredits,
    maxCredits,
    remainingCredits,
    percent,
    isComplete: completedCount === totalCount,
  };
}
