import type { AudienceSegment, CreditEventType, PlanTier, RequestedPlan } from "@/lib/db/types";

export const DEMO_INITIAL_CREDITS = 30;
export const ONBOARDING_TOTAL_BONUS_CREDITS = 30;

export interface AudienceOption {
  value: AudienceSegment;
  label: string;
  hint: string;
  track: "academic" | "commercial";
}

export const AUDIENCE_OPTIONS: readonly AudienceOption[] = [
  {
    value: "researcher",
    label: "Investigador / Consultor",
    hint: "Estudios independientes de UX, marca o consumidor",
    track: "commercial",
  },
  {
    value: "agency_company",
    label: "Agencia / Marca / Empresa",
    hint: "Equipos de marketing, producto o investigación aplicada",
    track: "commercial",
  },
  {
    value: "teacher",
    label: "Docente / Profesor",
    hint: "Clases, prácticas académicas y proyectos de aula",
    track: "academic",
  },
  {
    value: "student",
    label: "Estudiante",
    hint: "Tesis, prácticas o proyectos universitarios",
    track: "academic",
  },
  {
    value: "other",
    label: "Otro perfil",
    hint: "Uso exploratorio o distinto a los anteriores",
    track: "commercial",
  },
] as const;

export function getAudienceOption(segment: AudienceSegment | string | null | undefined): AudienceOption {
  return AUDIENCE_OPTIONS.find((o) => o.value === segment) ?? AUDIENCE_OPTIONS[4];
}

export function isAcademicAudience(segment: AudienceSegment | string | null | undefined): boolean {
  return getAudienceOption(segment).track === "academic";
}

export interface PlanLimits {
  maxProjects: number | null;
  maxStudies: number | null;
  maxResponsesPerStudy: number | null;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  badge: string;
  summary: string;
  limits: PlanLimits;
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  demo: {
    tier: "demo",
    name: "DEMO",
    badge: "DEMO",
    summary: "Cuenta de prueba con 30 créditos iniciales (+30 al completar el onboarding).",
    limits: {
      maxProjects: 1,
      maxStudies: 3,
      maxResponsesPerStudy: 15,
    },
  },
  academic: {
    tier: "academic",
    name: "Académico",
    badge: "ACADÉMICO",
    summary: "Membresía universitaria para docencia, aulas e investigación académica.",
    limits: {
      maxProjects: 15,
      maxStudies: 60,
      maxResponsesPerStudy: 250,
    },
  },
  pro: {
    tier: "pro",
    name: "Pro",
    badge: "PRO",
    summary: "Capacidad ampliada para consultores, marcas e investigación continua.",
    limits: {
      maxProjects: 25,
      maxStudies: 150,
      maxResponsesPerStudy: 1000,
    },
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    badge: "ENTERPRISE",
    summary: "Capacidad ilimitada y soporte dedicado para agencias e instituciones.",
    limits: {
      maxProjects: null,
      maxStudies: null,
      maxResponsesPerStudy: null,
    },
  },
};

export function getPlanDefinition(tier: PlanTier | string | null | undefined): PlanDefinition {
  if (tier === "academic" || tier === "pro" || tier === "enterprise") {
    return PLAN_DEFINITIONS[tier];
  }
  return PLAN_DEFINITIONS.demo;
}

export type CreditActionKey = "ai_analysis" | "ai_suggest" | "seo_audit" | "visual_ai";

export interface CreditCostDefinition {
  key: CreditActionKey;
  eventType: Extract<CreditEventType, "ai_analysis" | "ai_suggest" | "seo_audit" | "visual_ai">;
  cost: number;
  label: string;
}

export const CREDIT_COSTS: Record<CreditActionKey, CreditCostDefinition> = {
  ai_analysis: {
    key: "ai_analysis",
    eventType: "ai_analysis",
    cost: 5,
    label: "Análisis o reporte con IA",
  },
  seo_audit: {
    key: "seo_audit",
    eventType: "seo_audit",
    cost: 10,
    label: "Auditoría SEO en vivo",
  },
  visual_ai: {
    key: "visual_ai",
    eventType: "visual_ai",
    cost: 5,
    label: "Análisis visual / web con IA",
  },
  ai_suggest: {
    key: "ai_suggest",
    eventType: "ai_suggest",
    cost: 2,
    label: "Sugerencia asistida con IA",
  },
};

export interface GrowthOffer {
  id: RequestedPlan;
  title: string;
  subtitle: string;
  ctaLabel: string;
  recommended?: boolean;
  highlights: string[];
  audienceTrack: "academic" | "commercial";
}

export const GROWTH_OFFERS: readonly GrowthOffer[] = [
  {
    id: "academic_teacher",
    title: "Licencia Docente / Aula",
    subtitle: "Para profesores que dirigen prácticas y grupos en Aesteros",
    ctaLabel: "Solicitar licencia docente",
    recommended: true,
    audienceTrack: "academic",
    highlights: [
      "Hasta 15 proyectos y 60 estudios activos",
      "Hasta 250 participantes por estudio",
      "Bolsa ampliada de créditos para análisis con IA",
      "Acompañamiento para configurar tu edición o grupo",
    ],
  },
  {
    id: "academic_institution",
    title: "Convenio Universitario / Laboratorio",
    subtitle: "Despliegue dedicado con dominios autorizados y control de alumnos",
    ctaLabel: "Solicitar convenio institucional",
    audienceTrack: "academic",
    highlights: [
      "Identidad institucional y reglas de acceso maestro/alumno",
      "Múltiples grupos, docentes y bancos de estudios",
      "Capacidad extendida para tesis y semestres completos",
    ],
  },
  {
    id: "pro_researcher",
    title: "Plan Pro Investigador",
    subtitle: "Para consultores independientes y estudios continuos de mercado",
    ctaLabel: "Solicitar paso a Pro",
    recommended: true,
    audienceTrack: "commercial",
    highlights: [
      "Hasta 25 proyectos y 150 estudios",
      "Hasta 1,000 respuestas por estudio",
      "Créditos mensuales para análisis IA, Visual y SEO",
    ],
  },
  {
    id: "agency_team",
    title: "Plan Agencia / Marca",
    subtitle: "Para equipos comerciales con múltiples clientes o sitios web",
    ctaLabel: "Solicitar plan Agencia",
    audienceTrack: "commercial",
    highlights: [
      "Proyectos y estudios ampliados para cuentas múltiples",
      "Prioridad en auditorías SEO en vivo y análisis visual web",
      "Paquetes flexibles de créditos y soporte prioritario",
    ],
  },
  {
    id: "custom_credits",
    title: "Recarga de Créditos",
    subtitle: "Agrega créditos de IA y diagnóstico digital sin cambiar de flujo",
    ctaLabel: "Solicitar paquete de créditos",
    audienceTrack: "commercial",
    highlights: [
      "Paquetes de 100, 300 o 1,000 créditos bajo demanda",
      "Válidos para análisis IA, SEO en vivo y visión",
    ],
  },
] as const;

export function getOffersForAudience(segment: AudienceSegment | string | null | undefined): {
  primary: GrowthOffer[];
  secondary: GrowthOffer[];
} {
  const track = isAcademicAudience(segment) ? "academic" : "commercial";
  return {
    primary: GROWTH_OFFERS.filter((o) => o.audienceTrack === track),
    secondary: GROWTH_OFFERS.filter((o) => o.audienceTrack !== track),
  };
}

export function canCreateProjectUnderLimits(limits: PlanLimits, currentProjects: number): boolean {
  return limits.maxProjects === null || currentProjects < limits.maxProjects;
}

export function canCreateStudyUnderLimits(limits: PlanLimits, currentStudies: number): boolean {
  return limits.maxStudies === null || currentStudies < limits.maxStudies;
}
