// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAnswerSchema,
  DEFAULT_THANK_YOU,
  defaultConsentText,
  type SurveyConfig,
} from "@/tools/survey/engine";
import {
  DEFAULT_BATTERY_THANK_YOU,
  defaultBatteryConsentText,
  type BatteryConfig,
} from "../engine";
import type { StepLink } from "../participant";
import { BatteryRunner } from "./BatteryRunner";

// Los reintentos son reales (mismo número) pero sin esperar entre intentos.
vi.mock("@/tools/iat/runner/api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/tools/iat/runner/api")>();
  return {
    ...actual,
    withRetry: ((fn, o) =>
      actual.withRetry(fn, {
        ...o,
        baseDelayMs: 0,
      })) as typeof actual.withRetry,
  };
});

// Sin cuenta regresiva en las pruebas: el tiempo mínimo de la exposición se prueba en ExposureRunner.test.tsx.
vi.mock("../engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine")>()),
  EXPOSURE_SECONDS: 0,
}));

const TOKEN = "b".repeat(43);
const BATTERY_SESSION = "22222222-2222-4222-8222-222222222222";

const batteryConfig: BatteryConfig = {
  version: 1,
  title: "Estudio de marca",
  intro: "Son dos actividades.",
  texts: {
    consent: defaultBatteryConsentText("Estudio de marca"),
    thankYou: DEFAULT_BATTERY_THANK_YOU,
  },
};

function surveyOf(title: string, prompt: string): SurveyConfig {
  return {
    version: 1,
    title,
    texts: { consent: defaultConsentText(title), thankYou: DEFAULT_THANK_YOU },
    blocks: [
      {
        kind: "questions",
        id: "b",
        questions: [
          {
            type: "select",
            id: "q",
            prompt,
            required: true,
            options: ["Sí", "No"],
          },
        ],
      },
    ],
  };
}

const stepA: StepLink = {
  studyId: "study-a",
  tool: "survey",
  token: "a".repeat(43),
  config: surveyOf("Encuesta A", "Pregunta del paso uno"),
};
const stepB: StepLink = {
  studyId: "study-b",
  tool: "survey",
  token: "c".repeat(43),
  config: surveyOf("Encuesta B", "Pregunta del paso dos"),
};

const exposureStep: StepLink = {
  studyId: "study-x",
  tool: "visual",
  pieces: [
    {
      id: "p1",
      title: "Nombre interno",
      url: "https://signed.test/p1.webp",
      width: 800,
      height: 600,
    },
  ],
};

type ChildSession = {
  id: string;
  studyId: string;
  status: "started" | "completed" | "abandoned";
  battery: string | null;
};

/** Servidor falso: impone el orden como `link_battery_step` y deriva el progreso de las sesiones hijas. */
function createFakeServer(
  opts: {
    steps?: StepLink[];
    completed?: string[];
    checkCode?: string;
    progressFailures?: number;
  } = {},
) {
  const steps = opts.steps ?? [stepA, stepB];
  const state = {
    batteryStarts: 0,
    batteryCompleted: false,
    sessions: [] as ChildSession[],
    answers: {} as Record<string, unknown>,
    progressFailures: opts.progressFailures ?? 0,
    linkedStarts: 0,
    exposureStarts: 0,
  };
  for (const studyId of opts.completed ?? [])
    state.sessions.push({
      id: `done-${studyId}`,
      studyId,
      status: "completed",
      battery: BATTERY_SESSION,
    });

  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), { status });
  const fail = (code: string, status = 409) =>
    json(status, { ok: false, code, message: `error:${code}` });
  const progress = () => {
    const progress = steps.map((s) => {
      const mine = state.sessions.filter(
        (c) => c.studyId === s.studyId && c.battery === BATTERY_SESSION,
      );
      const status = mine.some((c) => c.status === "completed")
        ? "completed"
        : mine.some((c) => c.status === "started")
          ? "in_progress"
          : "pending";
      return { studyId: s.studyId, status };
    });
    return {
      status: state.batteryCompleted ? "completed" : "started",
      steps,
      progress,
      complete: progress.every((p) => p.status === "completed"),
    };
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://x");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = url.pathname;

    if (path === `/api/b/${TOKEN}/check`)
      return opts.checkCode ? fail(opts.checkCode) : json(200, { ok: true });
    if (path === `/api/b/${TOKEN}/start`) {
      state.batteryStarts++;
      return json(200, {
        ok: true,
        sessionId: BATTERY_SESSION,
        resumed: state.batteryStarts > 1 || (opts.completed?.length ?? 0) > 0,
        ...progress(),
      });
    }
    if (path === `/api/b/${TOKEN}/progress`) {
      if (state.progressFailures > 0) {
        state.progressFailures--;
        return fail("server_error", 500);
      }
      return json(200, { ok: true, ...progress() });
    }
    if (path === `/api/b/${TOKEN}/exposure/start`) {
      const index = steps.findIndex((s) => s.studyId === body.studyId);
      if (index < 0 || body.sessionId !== BATTERY_SESSION)
        return fail("invalid_data", 422);
      const previousDone = steps
        .slice(0, index)
        .every((s) =>
          state.sessions.some(
            (c) => c.studyId === s.studyId && c.status === "completed",
          ),
        );
      if (!previousDone) return fail("out_of_order");
      let session = state.sessions.find(
        (c) => c.studyId === body.studyId && c.battery === BATTERY_SESSION,
      );
      if (!session) {
        session = {
          id: `exp-${state.sessions.length + 1}`,
          studyId: body.studyId,
          status: "started",
          battery: BATTERY_SESSION,
        };
        state.sessions.push(session);
      }
      state.exposureStarts++;
      return json(200, { ok: true, sessionId: session.id });
    }
    if (path === `/api/b/${TOKEN}/exposure/complete`) {
      const session = state.sessions.find(
        (c) => c.id === body.exposureSessionId && c.battery === body.sessionId,
      );
      if (!session) return fail("not_found", 404);
      session.status = "completed";
      return json(200, { ok: true });
    }
    if (path === `/api/b/${TOKEN}/complete`) {
      if (!progress().complete) return fail("incomplete");
      state.batteryCompleted = true;
      return json(200, { ok: true });
    }

    const child = path.match(/^\/api\/s\/([^/]+)\/survey\/(start|submit)$/);
    if (child) {
      const step = steps.find((s) => "token" in s && s.token === child[1]);
      if (!step || step.tool !== "survey") return fail("invalid_link", 404);
      if (child[2] === "start") {
        if (body.batterySessionId !== BATTERY_SESSION)
          return fail("invalid_data", 422);
        const index = steps.indexOf(step);
        const previousDone = steps
          .slice(0, index)
          .every((s) =>
            state.sessions.some(
              (c) => c.studyId === s.studyId && c.status === "completed",
            ),
          );
        if (!previousDone) return fail("out_of_order");
        const id = `sess-${state.sessions.length + 1}`;
        state.sessions.push({
          id,
          studyId: step.studyId,
          status: "started",
          battery: BATTERY_SESSION,
        });
        state.linkedStarts++;
        return json(200, { ok: true, sessionId: id });
      }
      const parsed = buildAnswerSchema(step.config).safeParse(body.answers);
      if (!parsed.success) return fail("invalid_data", 422);
      const session = state.sessions.find((c) => c.id === body.sessionId);
      if (!session) return fail("not_found", 404);
      session.status = "completed";
      state.answers[step.studyId] = parsed.data;
      return json(200, { ok: true });
    }
    return json(404, {});
  };
  return { state, fetchImpl, steps };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(
  server = createFakeServer(),
  preview = false,
  previewSteps?: StepLink[],
) {
  const fetchSpy = vi.fn(server.fetchImpl);
  vi.stubGlobal("fetch", fetchSpy);
  const user = userEvent.setup();
  render(
    <BatteryRunner
      token={TOKEN}
      config={batteryConfig}
      preview={preview}
      previewSteps={previewSteps}
    />,
  );
  return { server, fetchSpy, user };
}

type User = ReturnType<typeof userEvent.setup>;

async function consentAndStart(user: User) {
  await user.click(
    screen.getByRole("checkbox", { name: /He leído la información/ }),
  );
  await user.click(screen.getByRole("button", { name: "Comenzar" }));
}

async function answerStep(user: User, prompt: RegExp, last: boolean) {
  const group = await screen.findByRole("group", { name: prompt });
  await user.click(within(group).getByRole("radio", { name: "Sí" }));
  await user.click(
    screen.getByRole("button", {
      name: last ? "Enviar respuestas" : "Continuar",
    }),
  );
}

describe("BatteryRunner · flujo completo", () => {
  it("un solo consentimiento, los pasos en orden (sin consentimiento propio) y agradecimiento final", async () => {
    const { server, user } = setup();

    expect(
      screen.getByRole("heading", { name: "Estudio de marca" }),
    ).toBeTruthy();
    expect(screen.getByText("Son dos actividades.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Comenzar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await consentAndStart(user);

    // Paso 1: la encuesta A arranca sola, sin pedir otro consentimiento.
    await answerStep(user, /Pregunta del paso uno/, true);
    expect(
      screen.queryByRole("checkbox", { name: /He leído la información/ }),
    ).toBeNull();

    // Paso 2.
    await answerStep(user, /Pregunta del paso dos/, true);

    await screen.findByTestId("thanks");
    expect(screen.getByText(/Completaste todas las actividades/)).toBeTruthy();
    expect(server.state.batteryStarts).toBe(1);
    expect(server.state.batteryCompleted).toBe(true);
    // Ambas sesiones quedaron ligadas a la sesión de batería y completadas.
    expect(
      server.state.sessions.map((s) => [s.studyId, s.status, s.battery]),
    ).toEqual([
      ["study-a", "completed", BATTERY_SESSION],
      ["study-b", "completed", BATTERY_SESSION],
    ]);
    expect(Object.keys(server.state.answers)).toEqual(["study-a", "study-b"]);
  });

  it("muestra en qué paso va", async () => {
    const { user } = setup();
    await consentAndStart(user);
    await screen.findByRole("group", { name: /Pregunta del paso uno/ });
    expect(screen.getByLabelText("Paso 1 de 2")).toBeTruthy();
  });

  it("con un solo paso no muestra el indicador de pasos", async () => {
    const { user } = setup(createFakeServer({ steps: [stepA] }));
    await consentAndStart(user);
    await screen.findByRole("group", { name: /Pregunta del paso uno/ });
    expect(screen.queryByLabelText(/Paso \d de \d/)).toBeNull();
  });
});

describe("BatteryRunner · paso de exposición (imagen con IA)", () => {
  it("muestra las imágenes, registra la exposición y sigue con la siguiente prueba", async () => {
    const { server, user } = setup(
      createFakeServer({ steps: [exposureStep, stepA] }),
    );
    await consentAndStart(user);

    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toBe("https://signed.test/p1.webp");
    expect(screen.getByLabelText("Paso 1 de 2")).toBeTruthy();
    // El participante no ve el nombre interno de la pieza.
    expect(document.body.textContent).not.toContain("Nombre interno");
    fireEvent.load(img);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    // Siguiente paso: la encuesta, que sólo se abre porque la exposición ya quedó completada.
    await answerStep(user, /Pregunta del paso uno/, true);
    await screen.findByTestId("thanks");
    expect(server.state.exposureStarts).toBe(1);
    expect(
      server.state.sessions.map((s) => [s.studyId, s.status, s.battery]),
    ).toEqual([
      ["study-x", "completed", BATTERY_SESSION],
      ["study-a", "completed", BATTERY_SESSION],
    ]);
    expect(server.state.batteryCompleted).toBe(true);
  });

  it("si recarga con la exposición hecha, retoma en el paso siguiente sin repetirla", async () => {
    const { server, user } = setup(
      createFakeServer({
        steps: [exposureStep, stepA],
        completed: ["study-x"],
      }),
    );
    await consentAndStart(user);
    expect(
      await screen.findByRole("group", { name: /Pregunta del paso uno/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(server.state.exposureStarts).toBe(0);
  });

  it("vista previa: recorre la exposición sin guardar nada", async () => {
    const { fetchSpy, user } = setup(
      createFakeServer({ steps: [exposureStep, stepA] }),
      true,
      [exposureStep, stepA],
    );
    await consentAndStart(user);
    const img = await screen.findByRole("img");
    fireEvent.load(img);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByRole("group", { name: /Pregunta del paso uno/ }),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("BatteryRunner · reanudación", () => {
  it("retoma en el primer paso sin completar tras recargar", async () => {
    const { server, user } = setup(
      createFakeServer({ completed: ["study-a"] }),
    );
    await consentAndStart(user);
    // No repite el paso 1: va directo al paso 2.
    expect(
      await screen.findByRole("group", { name: /Pregunta del paso dos/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: /Pregunta del paso uno/ }),
    ).toBeNull();
    expect(screen.getByLabelText("Paso 2 de 2")).toBeTruthy();

    await answerStep(user, /Pregunta del paso dos/, true);
    await screen.findByTestId("thanks");
    expect(server.state.batteryCompleted).toBe(true);
  });

  it("si ya había terminado todos los pasos, cierra y agradece sin mostrar ninguno", async () => {
    const { server, user } = setup(
      createFakeServer({ completed: ["study-a", "study-b"] }),
    );
    await consentAndStart(user);
    await screen.findByTestId("thanks");
    expect(server.state.linkedStarts).toBe(0);
    expect(server.state.batteryCompleted).toBe(true);
  });
});

describe("BatteryRunner · errores", () => {
  it("si la liga ya fue usada, avisa antes de pedir nada", async () => {
    setup(createFakeServer({ checkCode: "already_participated" }));
    expect((await screen.findByTestId("blocked")).textContent).toBe(
      "error:already_participated",
    );
  });

  it("un fallo al confirmar el progreso permite reintentar sin perder lo respondido", async () => {
    // 5 fallos agotan los reintentos automáticos (1 + 4) de la primera confirmación.
    const { server, user } = setup(createFakeServer({ progressFailures: 5 }));
    await consentAndStart(user);
    await answerStep(user, /Pregunta del paso uno/, true);

    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(
      screen.getByText("Tus respuestas ya se guardaron; sólo falta continuar."),
    ).toBeTruthy();
    expect(server.state.sessions[0]!.status).toBe("completed");
    await user.click(retry);

    // Tras reintentar continúa en el paso 2 y termina.
    await answerStep(user, /Pregunta del paso dos/, true);
    await screen.findByTestId("thanks");
    expect(server.state.batteryCompleted).toBe(true);
  });

  it("si un paso se intenta fuera de orden, el servidor lo rechaza y se informa", async () => {
    // El servidor sólo conoce el paso B como primero pendiente, pero el cliente (mal) arrancaría A: simulamos el rechazo.
    const server = createFakeServer();
    server.state.sessions = []; // ninguno completado
    const original = server.fetchImpl;
    server.fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/api/s/${stepA.token}/survey/start`))
        return new Response(
          JSON.stringify({
            ok: false,
            code: "out_of_order",
            message: "error:out_of_order",
          }),
          { status: 409 },
        );
      return original(input, init);
    };
    const { user } = setup(server);
    await consentAndStart(user);
    expect(await screen.findByText("error:out_of_order")).toBeTruthy();
  });
});

describe("BatteryRunner · vista previa", () => {
  it("recorre los pasos activos sin llamar al servidor", async () => {
    const { fetchSpy, user } = setup(createFakeServer(), true, [stepA, stepB]);
    expect(
      screen.getByText("Vista previa: no se guarda ningún dato.", {
        selector: "div",
      }),
    ).toBeTruthy();
    await consentAndStart(user);
    await answerStep(user, /Pregunta del paso uno/, true);
    await answerStep(user, /Pregunta del paso dos/, true);
    await screen.findByTestId("thanks");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sin pasos activos lo dice en lugar de quedarse en blanco", async () => {
    const { user } = setup(createFakeServer(), true, []);
    await consentAndStart(user);
    await waitFor(() =>
      expect(screen.getByTestId("blocked").textContent).toBe(
        "Esta batería no tiene pasos activos.",
      ),
    );
  });
});
