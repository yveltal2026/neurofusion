"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { getInstrument, type InstrumentId, type PriceMethod } from "../engine";
import { createSurveyStudy } from "./actions";
import { AddBlockPanel, AddQuestionRow } from "./AddBlockPanel";
import { BlockSection, InstrumentCard, PriceCard } from "./BlockCards";
import { INSTRUMENT_CATALOG, PRICE_CATALOG } from "./catalog";
import {
  addInstrumentBlock,
  addPriceBlock,
  addQuestion,
  addQuestionsBlock,
  buildConfig,
  changeQuestionType,
  countItems,
  duplicateQuestion,
  emptyDraft,
  moveBlock,
  moveQuestion,
  removeBlock,
  removeQuestion,
  setConsent,
  setTitle,
  updateBlock,
  updateQuestion,
  type BuildIssue,
  type QuestionType,
  type SurveyDraft,
  type SurveyTemplate,
} from "./model";
import { QuestionCard } from "./QuestionCard";
import { TemplatePicker } from "./TemplatePicker";
import { createSurveyWithImages } from "./upload-images";

/** Nombre del estudio vacío: se valida aquí porque el motor sólo conoce la configuración. */
function validate(d: SurveyDraft): BuildIssue[] {
  const issues: BuildIssue[] = [];
  if (!d.name.trim())
    issues.push({
      text: "Escribe un nombre para el estudio",
      message: "Escribe un nombre para el estudio",
      field: "name",
    });
  const built = buildConfig(d);
  if (!built.ok) issues.push(...built.issues);
  return issues;
}

interface UndoState {
  label: string;
  draft: SurveyDraft;
  started: boolean;
}

const UNDO_MS = 8000;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function SurveyBuilder({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft());
  const [started, setStarted] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [scrollTo, setScrollTo] = useState<{ id: string; n: number } | null>(
    null,
  );

  // Tras un primer intento fallido, los errores se recalculan al editar: desaparecen al corregirlos.
  const issues = useMemo(
    () => (attempted ? validate(draft) : []),
    [attempted, draft],
  );
  const stats = useMemo(() => countItems(draft), [draft]);

  const problemsOf = (blockId: string, questionId?: string) =>
    issues
      .filter(
        (i) =>
          i.blockId === blockId &&
          (questionId ? i.questionId === questionId : !i.questionId),
      )
      .map((i) => i.message);
  const fieldProblem = (field: BuildIssue["field"]) =>
    issues.find((i) => i.field === field)?.message;

  useEffect(() => {
    if (!scrollTo) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document
      .getElementById(`sb-${scrollTo.id}`)
      ?.scrollIntoView?.({
        block: "center",
        behavior: reduce ? "auto" : "smooth",
      });
  }, [scrollTo]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const reveal = (id: string) =>
    setScrollTo((s) => ({ id, n: (s?.n ?? 0) + 1 }));

  function startFrom(t: SurveyTemplate) {
    setDraft(t.build());
    setStarted(true);
    setAttempted(false);
    setActiveId(null);
    setAdding(false);
    setUndo(null);
    window.scrollTo?.({ top: 0 });
  }

  /** Aplica un borrado y deja un aviso para deshacerlo, en lugar de pedir confirmación. */
  function removeWith(label: string, fn: (d: SurveyDraft) => SurveyDraft) {
    setUndo({ label, draft, started: true });
    setDraft(fn(draft));
  }

  function addQuestionOfType(blockId: string, type: QuestionType) {
    const id = `p${draft.counter + 1}`;
    setDraft(addQuestion(draft, blockId, type));
    setActiveId(id);
    reveal(id);
  }

  function addBlockWith(next: SurveyDraft, activate?: string) {
    const added = next.blocks[next.blocks.length - 1]!;
    setDraft(next);
    setAdding(false);
    if (activate) setActiveId(activate);
    reveal(activate ?? added.id);
  }

  function addOwnQuestions() {
    // Un bloque nunca queda vacío: arranca con una pregunta de opción única lista para escribir.
    const withBlock = addQuestionsBlock(draft);
    const block = withBlock.blocks[withBlock.blocks.length - 1]!;
    const next = addQuestion(withBlock, block.id, "select");
    addBlockWith(next, `p${next.counter}`);
  }

  function goTo(i: BuildIssue) {
    if (i.questionId) setActiveId(i.questionId);
    if (i.field === "consent") setConsentOpen(true);
    const target =
      i.questionId ??
      i.blockId ??
      (i.field === "name"
        ? "name"
        : i.field === "thankYou"
          ? "end"
          : i.field
            ? "header"
            : "add");
    reveal(target);
    if (i.field === "name")
      document.getElementById("sb-name")?.focus({ preventScroll: true });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setAttempted(true);
    const found = validate(draft);
    if (found.length) {
      goTo(found[0]!);
      return;
    }
    const built = buildConfig(draft);
    if (!built.ok) return;
    startTransition(async () => {
      const hasImages = draft.blocks.some((b) => b.kind === "questions" && b.questions.some((q) => q.image));
      if (hasImages) {
        try {
          const res = await createSurveyWithImages(projectId, draft, built.config);
          if (res.error) setServerError(res.error);
          else if (res.studyId) router.push(`/studies/${res.studyId}?created=1`);
        } catch {
          setServerError("No se pudo guardar la encuesta. Tus imágenes siguen aquí; vuelve a intentarlo.");
        }
        return;
      }
      const res = await createSurveyStudy({
        projectId,
        name: draft.name,
        config: built.config,
      });
      // En éxito la acción redirige; sólo vuelve aquí si hubo un error.
      if (res?.error) setServerError(res.error);
    });
  }

  if (!started) {
    return <TemplatePicker projectName={projectName} onPick={startFrom} />;
  }

  const nameProblem = fieldProblem("name");
  const titleProblem = fieldProblem("title");
  const introProblem = fieldProblem("intro");
  const consentProblem = fieldProblem("consent");
  const thankYouProblem = fieldProblem("thankYou");
  const consentVisible = consentOpen || Boolean(consentProblem);

  return (
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
      <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-background px-6 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/projects/${projectId}`}
            aria-label={`Volver al proyecto ${projectName}`}
            title={`Proyecto: ${projectName}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-heading hover:bg-heading/10"
          >
            <Icon name="folder" className="size-6" />
          </Link>
          <div className="min-w-0 flex-1 basis-56">
            <input
              id="sb-name"
              aria-label="Nombre del estudio (sólo lo ves tú)"
              aria-invalid={nameProblem ? true : undefined}
              placeholder="Nombre del estudio"
              className={`w-full border-b-2 bg-transparent py-1 font-display text-base font-semibold text-heading outline-none transition placeholder:font-normal placeholder:text-muted focus:border-heading focus-visible:outline-none ${
                nameProblem
                  ? "border-danger"
                  : "border-transparent hover:border-border"
              }`}
              value={draft.name}
              maxLength={160}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <p className="text-xs text-muted" aria-live="polite">
              {plural(stats.blocks, "bloque", "bloques")} ·{" "}
              {plural(stats.items, "pregunta", "preguntas")}
              {issues.length ? (
                <span className="ml-2 font-semibold text-foreground">
                  {plural(issues.length, "pendiente", "pendientes")}
                </span>
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setUndo({
                label: "Volviste a las plantillas",
                draft,
                started: true,
              });
              setDraft(emptyDraft());
              setStarted(false);
              setAttempted(false);
              setAdding(false);
              setActiveId(null);
            }}
          >
            Cambiar plantilla
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Crear encuesta y generar liga"}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 py-6">
        {issues.length ? (
          <Alert tone="error">
            <p className="font-medium">
              Falta corregir {plural(issues.length, "cosa", "cosas")} para crear
              la encuesta:
            </p>
            <ul className="mt-1 space-y-0.5">
              {issues.slice(0, 8).map((i) => (
                <li key={i.text}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className="text-left underline underline-offset-2 hover:text-heading"
                  >
                    {i.text}
                  </button>
                </li>
              ))}
            </ul>
            {issues.length > 8 ? (
              <p className="mt-1">…y {issues.length - 8} más.</p>
            ) : null}
          </Alert>
        ) : null}
        {serverError ? <Alert tone="error">{serverError}</Alert> : null}

        <section
          id="sb-header"
          aria-label="Encabezado de la encuesta"
          className="scroll-mt-28 space-y-4 rounded-lg border border-t-[6px] border-border border-t-primary bg-surface p-6"
        >
          <div className="space-y-1">
            <input
              aria-label="Título para el participante"
              aria-invalid={titleProblem ? true : undefined}
              placeholder="Título de la encuesta"
              className={`w-full border-b-2 bg-transparent py-1.5 font-display text-2xl font-bold tracking-tight text-heading outline-none transition placeholder:text-muted/70 focus:border-heading focus-visible:outline-none ${
                titleProblem ? "border-danger" : "border-border"
              }`}
              value={draft.title}
              maxLength={160}
              onChange={(e) => setDraft(setTitle(draft, e.target.value))}
            />
            {titleProblem ? <FieldProblem>{titleProblem}</FieldProblem> : null}
          </div>
          <div className="space-y-1">
            <textarea
              aria-label="Introducción (opcional)"
              aria-invalid={introProblem ? true : undefined}
              placeholder="Introducción o descripción (opcional). Se muestra antes del consentimiento."
              rows={2}
              className="w-full resize-y border-b border-border bg-transparent py-1.5 text-sm outline-none transition placeholder:text-muted focus:border-heading focus-visible:outline-none"
              value={draft.intro}
              maxLength={2000}
              onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
            />
            {introProblem ? <FieldProblem>{introProblem}</FieldProblem> : null}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-heading">
                  Consentimiento informado
                </p>
                <p className="text-xs text-muted">
                  {draft.consentEdited
                    ? "Editado por ti."
                    : "Se genera con el título."}{" "}
                  Tu equipo legal debe validarlo antes de usar la liga con
                  personas reales.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={consentVisible}
                onClick={() => setConsentOpen(!consentVisible)}
              >
                {consentVisible ? "Ocultar texto" : "Editar consentimiento"}
              </Button>
            </div>
            {consentVisible ? (
              <div className="space-y-1">
                <Textarea
                  aria-label="Consentimiento"
                  aria-invalid={consentProblem ? true : undefined}
                  value={draft.consent}
                  onChange={(e) => setDraft(setConsent(draft, e.target.value))}
                  rows={8}
                  maxLength={4000}
                />
                {consentProblem ? (
                  <FieldProblem>{consentProblem}</FieldProblem>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {draft.blocks.map((block, index) => {
          const common = {
            index,
            count: draft.blocks.length,
            onMove: (delta: -1 | 1) =>
              setDraft(moveBlock(draft, block.id, delta)),
            onRemove: () =>
              removeWith(`Bloque ${index + 1} quitado`, (d) =>
                removeBlock(d, block.id),
              ),
          };
          if (block.kind === "price")
            return (
              <BlockSection
                key={block.id}
                id={block.id}
                icon={PRICE_CATALOG[block.method].icon}
                title={
                  block.method === "van_westendorp"
                    ? "Precio · Van Westendorp"
                    : "Precio · Gabor-Granger"
                }
                {...common}
              >
                <PriceCard
                  block={block}
                  problems={problemsOf(block.id)}
                  onChange={(p) => setDraft(updateBlock(draft, block.id, p))}
                />
              </BlockSection>
            );
          if (block.kind === "instrument")
            return (
              <BlockSection
                key={block.id}
                id={block.id}
                icon={INSTRUMENT_CATALOG[block.instrumentId].icon}
                title={getInstrument(block.instrumentId).name}
                {...common}
              >
                <InstrumentCard
                  block={block}
                  problems={problemsOf(block.id)}
                  onChange={(p) => setDraft(updateBlock(draft, block.id, p))}
                />
              </BlockSection>
            );
          return (
            <BlockSection
              key={block.id}
              id={block.id}
              icon="survey"
              title="Preguntas"
              {...common}
            >
              {block.questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  count={block.questions.length}
                  active={activeId === q.id}
                  problems={problemsOf(block.id, q.id)}
                  onActivate={() => setActiveId(q.id)}
                  onChange={(p) =>
                    setDraft(updateQuestion(draft, block.id, q.id, p))
                  }
                  onChangeType={(type) =>
                    setDraft(changeQuestionType(draft, block.id, q.id, type))
                  }
                  onMove={(delta) =>
                    setDraft(moveQuestion(draft, block.id, q.id, delta))
                  }
                  onDuplicate={() => {
                    const id = `p${draft.counter + 1}`;
                    setDraft(duplicateQuestion(draft, block.id, q.id));
                    setActiveId(id);
                    reveal(id);
                  }}
                  onRemove={() =>
                    removeWith(`Pregunta ${i + 1} quitada`, (d) =>
                      removeQuestion(d, block.id, q.id),
                    )
                  }
                />
              ))}
              <AddQuestionRow
                first={block.questions.length === 0}
                onAdd={(type) => addQuestionOfType(block.id, type)}
              />
            </BlockSection>
          );
        })}

        <AddBlockPanel
          empty={draft.blocks.length === 0}
          open={adding}
          onOpen={() => setAdding(true)}
          onClose={() => setAdding(false)}
          onAddQuestions={addOwnQuestions}
          onAddInstrument={(id: InstrumentId) =>
            addBlockWith(addInstrumentBlock(draft, id))
          }
          onAddPrice={(m: PriceMethod) => addBlockWith(addPriceBlock(draft, m))}
        />

        <section
          id="sb-end"
          aria-label="Pantalla final"
          className="scroll-mt-28 space-y-3 rounded-lg border border-border bg-surface p-6"
        >
          <div className="space-y-0.5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Icon name="check" className="size-6" />
              Pantalla final
            </h2>
            <p className="text-sm text-muted">
              Lo último que lee el participante al enviar sus respuestas.
            </p>
          </div>
          <Textarea
            aria-label="Mensaje de agradecimiento"
            aria-invalid={thankYouProblem ? true : undefined}
            value={draft.thankYou}
            onChange={(e) => setDraft({ ...draft, thankYou: e.target.value })}
            rows={3}
            maxLength={1000}
          />
          {thankYouProblem ? (
            <FieldProblem>{thankYouProblem}</FieldProblem>
          ) : null}
        </section>
      </div>

      {undo ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-sm items-center justify-between gap-4 rounded-full bg-heading py-2 pl-5 pr-2 text-sm text-background shadow-lg"
        >
          {undo.label}
          <button
            type="button"
            onClick={() => {
              setDraft(undo.draft);
              setStarted(undo.started);
              setUndo(null);
            }}
            className="rounded-full px-4 py-2 font-semibold underline underline-offset-4 hover:bg-background/15 focus-visible:outline-background"
          >
            Deshacer
          </button>
        </div>
      ) : null}
      </fieldset>
    </form>
  );
}

function FieldProblem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-sm text-foreground">
      <Icon name="alert" className="size-5 text-danger" />
      {children}
    </p>
  );
}
