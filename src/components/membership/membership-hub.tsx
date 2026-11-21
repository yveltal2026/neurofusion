"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  redeemActivationCodeAction,
  submitMembershipRequestAction,
  type MembershipActionState,
} from "@/app/(app)/membresia/actions";
import type {
  CreditLedgerRow,
  MembershipRequestRow,
  RequestedPlan,
} from "@/lib/db/types";
import {
  CREDIT_COSTS,
  getAudienceOption,
  getOffersForAudience,
  isAcademicAudience,
} from "@/lib/plans/quotas";
import type { OrgBillingSummary } from "@/lib/plans/server";

const initialState: MembershipActionState = {};

const REQUEST_STATUS_LABEL: Record<
  MembershipRequestRow["status"],
  { label: string; tone: "neutral" | "success" | "warning" }
> = {
  pending: { label: "Pendiente", tone: "warning" },
  contacted: { label: "En contacto", tone: "neutral" },
  approved: { label: "Aprobada", tone: "success" },
  rejected: { label: "No aprobada", tone: "neutral" },
};

export function MembershipHub({
  billing,
  userEmail,
  ledger,
  requests,
  limitBanner,
}: {
  billing: OrgBillingSummary;
  userEmail: string;
  ledger: CreditLedgerRow[];
  requests: MembershipRequestRow[];
  limitBanner?: string;
}) {
  const audience = getAudienceOption(billing.audienceSegment);
  const academic = isAcademicAudience(billing.audienceSegment);
  const offers = getOffersForAudience(billing.audienceSegment);

  const [selectedPlan, setSelectedPlan] = useState<RequestedPlan>(
    offers.primary[0]?.id ?? "pro_researcher",
  );
  const [showOtherOffers, setShowOtherOffers] = useState(false);

  const [reqState, reqAction, reqPending] = useActionState(
    submitMembershipRequestAction,
    initialState,
  );
  const [codeState, codeAction, codePending] = useActionState(
    redeemActivationCodeAction,
    initialState,
  );

  const displayedOffers = showOtherOffers
    ? [...offers.primary, ...offers.secondary]
    : offers.primary;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-semibold text-heading">
            Perfil registrado: {audience.label}
          </span>
          <h1 className="page-title mt-3">Plan, Créditos y Membresía</h1>
          <p className="mt-2 max-w-2xl text-muted">
            {academic
              ? "Opciones diseñadas para docencia, aulas e investigación universitaria según tu registro."
              : "Opciones pensadas para consultores, marcas, agencias y equipos de investigación."}
          </p>
        </div>
        <Link href="/projects" className={buttonClass("secondary")}>
          Volver a Proyectos
        </Link>
      </div>

      {limitBanner === "studies" ? (
        <Alert tone="warning">
          Alcanzaste el límite de estudios del plan {billing.planName}. Solicita ampliar tu membresía o canjea un código abajo.
        </Alert>
      ) : null}

      {/* Resumen de plan, uso y saldo */}
      <section
        aria-labelledby="plan-summary-heading"
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="glass-panel rounded-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 id="plan-summary-heading" className="text-sm font-semibold text-muted">
              Plan actual
            </h2>
            <StatusBadge tone={billing.planTier === "demo" ? "warning" : "success"}>
              {billing.planBadge}
            </StatusBadge>
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums text-heading">
            {billing.creditBalance}{" "}
            <span className="text-base font-semibold text-muted">créditos</span>
          </p>
          <p className="mt-2 text-xs text-muted">
            Análisis IA: {CREDIT_COSTS.ai_analysis.cost} · Visual IA:{" "}
            {CREDIT_COSTS.visual_ai.cost} · SEO en vivo:{" "}
            {CREDIT_COSTS.seo_audit.cost} · Sugerencias IA:{" "}
            {CREDIT_COSTS.ai_suggest.cost} créditos.
          </p>
        </div>

        <div className="glass-panel rounded-panel p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-muted">Uso estructural</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Proyectos</dt>
              <dd className="font-semibold tabular-nums text-heading">
                {billing.usage.projectsCount} /{" "}
                {billing.limits.maxProjects ?? "Ilimitados"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Estudios</dt>
              <dd className="font-semibold tabular-nums text-heading">
                {billing.usage.studiesCount} /{" "}
                {billing.limits.maxStudies ?? "Ilimitados"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Respuestas por estudio</dt>
              <dd className="font-semibold tabular-nums text-heading">
                {billing.limits.maxResponsesPerStudy ?? "Ilimitadas"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="glass-panel rounded-panel p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-muted">Canjear código</h3>
          <p className="mt-1 text-xs text-muted">
            ¿Recibiste un código de activación, beca académica o paquete beta?
          </p>
          <form action={codeAction} className="mt-3 space-y-2.5">
            {codeState.error ? <Alert tone="error">{codeState.error}</Alert> : null}
            {codeState.message ? (
              <Alert tone="info">{codeState.message}</Alert>
            ) : null}
            <label htmlFor="activation-code-input" className="sr-only">
              Código de activación
            </label>
            <input
              id="activation-code-input"
              name="code"
              type="text"
              required
              placeholder="Ej. AESTEROS-PRO-2026"
              className="h-11 w-full rounded-xl border border-control bg-surface px-3.5 text-sm uppercase text-heading placeholder:normal-case placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-heading/20"
            />
            <Button type="submit" disabled={codePending} className="w-full">
              {codePending ? "Validando…" : "Aplicar código"}
            </Button>
          </form>
        </div>
      </section>

      {/* Catálogo personalizado según audiencia */}
      <section aria-labelledby="growth-offers-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="growth-offers-heading" className="text-xl font-bold text-heading">
              {academic
                ? "Opciones académicas para tu perfil"
                : "Planes y crecimiento para tu equipo"}
            </h2>
            <p className="text-sm text-muted">
              Selecciona una opción para prellenar tu solicitud de ascenso o licencia.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowOtherOffers((v) => !v)}
          >
            {showOtherOffers
              ? "Ocultar otras opciones"
              : academic
                ? "Ver planes comerciales"
                : "Ver opciones académicas"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedOffers.map((offer) => {
            const active = selectedPlan === offer.id;
            return (
              <article
                key={offer.id}
                className={`glass-panel flex flex-col justify-between rounded-panel border p-5 sm:p-6 ${
                  active ? "border-amber-500 ring-2 ring-amber-500/20" : "border-border"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-heading">{offer.title}</h3>
                    {offer.recommended ? (
                      <StatusBadge tone="warning">Recomendado</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{offer.subtitle}</p>
                  <ul className="mt-4 space-y-2 text-sm text-body">
                    {offer.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2">
                        <span aria-hidden="true" className="font-bold text-emerald-600">
                          ✓
                        </span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href="#solicitud-membresia"
                  onClick={() => setSelectedPlan(offer.id)}
                  className={buttonClass(
                    active ? "primary" : "secondary",
                    "mt-5 w-full",
                  )}
                >
                  {offer.ctaLabel}
                </a>
              </article>
            );
          })}
        </div>
      </section>

      {/* Formulario de solicitud + historial */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          id="solicitud-membresia"
          aria-labelledby="request-form-heading"
          className="glass-panel scroll-mt-4 rounded-panel p-5 sm:p-6"
        >
          <h2 id="request-form-heading" className="text-lg font-bold text-heading">
            {academic
              ? "Solicitar licencia o verificación académica"
              : "Solicitar ampliación de membresía"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {billing.audienceSegment === "student"
              ? "Si eres estudiante, indícanos tu universidad, proyecto o docente asesor para orientar tu acceso."
              : academic
                ? "Usa tu correo institucional para agilizar la validación de tu facultad o laboratorio."
                : "Cuéntanos brevemente tu volumen estimado de estudios o sitios para activar tu plan."}
          </p>

          <form action={reqAction} className="mt-4 space-y-3.5">
            {reqState.error ? <Alert tone="error">{reqState.error}</Alert> : null}
            {reqState.message ? (
              <Alert tone="info">{reqState.message}</Alert>
            ) : null}

            <div className="space-y-1">
              <label
                htmlFor="req-plan"
                className="block text-xs font-semibold text-heading"
              >
                Opción solicitada
              </label>
              <select
                id="req-plan"
                name="requested_plan"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value as RequestedPlan)}
                className="h-11 w-full rounded-xl border border-control bg-surface px-3.5 text-sm text-heading"
              >
                {[...offers.primary, ...offers.secondary].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="req-org"
                className="block text-xs font-semibold text-heading"
              >
                {academic ? "Universidad o institución" : "Empresa, marca o agencia"}
              </label>
              <input
                id="req-org"
                name="organization_name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                defaultValue={billing.declaredOrganization ?? ""}
                placeholder={
                  academic
                    ? "Ej. Universidad Anáhuac Mayab"
                    : "Ej. Estudio / Consultora"
                }
                className="h-11 w-full rounded-xl border border-control bg-surface px-3.5 text-sm text-heading"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="req-email"
                className="block text-xs font-semibold text-heading"
              >
                {academic
                  ? "Correo institucional de contacto"
                  : "Correo de contacto"}
              </label>
              <input
                id="req-email"
                name="institutional_email"
                type="email"
                maxLength={160}
                defaultValue={userEmail}
                className="h-11 w-full rounded-xl border border-control bg-surface px-3.5 text-sm text-heading"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="req-notes"
                className="block text-xs font-semibold text-heading"
              >
                Contexto o comentarios (opcional)
              </label>
              <textarea
                id="req-notes"
                name="notes"
                rows={3}
                maxLength={1000}
                placeholder={
                  academic
                    ? "Materia, número aproximado de alumnos o alcance de tesis…"
                    : "Cantidad aproximada de estudios, sitios o participantes mensuales…"
                }
                className="w-full rounded-xl border border-control bg-surface p-3 text-sm text-heading"
              />
            </div>

            <Button type="submit" disabled={reqPending} className="w-full">
              {reqPending ? "Enviando solicitud…" : "Enviar solicitud"}
            </Button>
          </form>

          {requests.length > 0 ? (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                Solicitudes recientes
              </h3>
              <ul className="mt-2.5 space-y-2 text-sm">
                {requests.map((r) => {
                  const st = REQUEST_STATUS_LABEL[r.status];
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-heading">
                          {r.organization_name}
                        </p>
                        <p className="text-xs text-muted">{r.requested_plan}</p>
                      </div>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="ledger-heading"
          className="glass-panel rounded-panel p-5 sm:p-6"
        >
          <h2 id="ledger-heading" className="text-lg font-bold text-heading">
            Historial de créditos
          </h2>
          <p className="mt-1 text-xs text-muted">
            Últimos movimientos registrados en tu organización.
          </p>

          {ledger.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Aún no hay movimientos registrados.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted">
                  <tr>
                    <th scope="col" className="pb-2 pr-3">
                      Movimiento
                    </th>
                    <th scope="col" className="pb-2 pr-3 text-right">
                      Créditos
                    </th>
                    <th scope="col" className="pb-2 text-right">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-medium text-heading">
                        {row.description}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right font-bold tabular-nums ${
                          row.delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-heading"
                        }`}
                      >
                        {row.delta > 0 ? `+${row.delta}` : row.delta}
                      </td>
                      <td className="py-2 text-right text-xs whitespace-nowrap text-muted">
                        <time dateTime={row.created_at}>
                          {new Date(row.created_at).toLocaleDateString("es-MX", {
                            timeZone: "America/Mexico_City",
                          })}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
