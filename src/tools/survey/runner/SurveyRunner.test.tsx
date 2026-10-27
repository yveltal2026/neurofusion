// @vitest-environment jsdom
import {
  cleanup,
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
  scoreSurvey,
  type SurveyConfig,
} from "../engine";
import { SurveyRunner } from "./SurveyRunner";

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

const TOKEN = "t".repeat(43);

const config: SurveyConfig = {
  version: 1,
  title: "Tienda en línea",
  intro: "Queremos conocer tu experiencia.",
  texts: {
    consent: defaultConsentText("Tienda en línea"),
    thankYou: DEFAULT_THANK_YOU,
  },
  blocks: [
    {
      kind: "questions",
      id: "perfil",
      questions: [
        {
          type: "select",
          id: "frecuencia",
          prompt: "¿Con qué frecuencia compras en línea?",
          required: true,
          options: ["Semanal", "Mensual"],
        },
        {
          type: "multiselect",
          id: "canales",
          prompt: "¿Dónde compras?",
          required: false,
          options: ["Web", "App", "Tienda"],
        },
        {
          type: "likert",
          id: "confianza",
          prompt: "Confío en las tiendas en línea",
          required: true,
          points: 5,
          minLabel: "Nada",
          maxLabel: "Mucho",
        },
        {
          type: "text",
          id: "comentario",
          prompt: "Comentarios",
          required: false,
        },
      ],
    },
    {
      kind: "instrument",
      id: "sus",
      instrumentId: "sus",
      subject: "esta tienda",
      required: true,
    },
    {
      kind: "instrument",
      id: "nps",
      instrumentId: "nps",
      subject: "esta tienda",
      required: true,
    },
  ],
};

/** Servidor falso: valida con el MISMO esquema estricto y puntúa con el mismo motor que el servidor real. */
function createFakeServer(
  opts: { checkCode?: string; startCode?: string; submitCodes?: string[] } = {},
) {
  const state = {
    started: 0,
    submits: 0,
    answers: null as Record<string, unknown> | null,
    scores: null as unknown,
    device: null as unknown,
  };
  const submitCodes = [...(opts.submitCodes ?? [])];
  const fail = (code: string, status = 409) =>
    new Response(
      JSON.stringify({ ok: false, code, message: `error:${code}` }),
      { status },
    );
  const ok = (extra: object = {}) =>
    new Response(JSON.stringify({ ok: true, ...extra }), { status: 200 });

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/survey/check"))
      return opts.checkCode ? fail(opts.checkCode) : ok();
    if (url.endsWith("/survey/start")) {
      if (opts.startCode) return fail(opts.startCode);
      state.started++;
      state.device = body.device;
      return body.consent === true
        ? ok({ sessionId: "11111111-1111-4111-8111-111111111111" })
        : fail("invalid_data", 422);
    }
    if (url.endsWith("/survey/submit")) {
      state.submits++;
      const forced = submitCodes.shift();
      if (forced) return fail(forced, forced === "server_error" ? 500 : 422);
      const parsed = buildAnswerSchema(config).safeParse(body.answers);
      if (!parsed.success) return fail("invalid_data", 422);
      state.answers = parsed.data;
      state.scores = scoreSurvey(config, parsed.data);
      return ok();
    }
    return new Response("{}", { status: 404 });
  };
  return { state, fetchImpl };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(server = createFakeServer(), preview = false) {
  const fetchSpy = vi.fn(server.fetchImpl);
  vi.stubGlobal("fetch", fetchSpy);
  const user = userEvent.setup();
  render(<SurveyRunner token={TOKEN} config={config} preview={preview} />);
  return { server, fetchSpy, user };
}

type User = ReturnType<typeof userEvent.setup>;

async function consentAndStart(user: User) {
  await user.click(
    screen.getByRole("checkbox", { name: /He leído la información/ }),
  );
  await user.click(screen.getByRole("button", { name: "Comenzar" }));
}

async function pick(
  user: User,
  group: RegExp | string,
  option: RegExp | string,
) {
  const g = await screen.findByRole("group", { name: group });
  await user.click(within(g).getByRole("radio", { name: option }));
}

async function fillProfile(user: User) {
  await pick(user, /con qué frecuencia compras/i, "Semanal");
  await user.click(screen.getByRole("checkbox", { name: "Web" }));
  await user.click(screen.getByRole("checkbox", { name: "App" }));
  await pick(user, /Confío en las tiendas/, /^4$/);
}

async function fillSus(user: User, values: number[]) {
  const texts = (await screen.findAllByRole("group")).map((g) => g);
  expect(texts).toHaveLength(10);
  for (let i = 0; i < 10; i++) {
    await user.click(
      within(texts[i]!).getByRole("radio", {
        name: new RegExp(`^${values[i]}\\b`),
      }),
    );
  }
}

describe("SurveyRunner · flujo completo", () => {
  it("consentimiento → bloques → envío → gracias; el servidor valida y puntúa", async () => {
    const { server, user } = setup();

    expect(
      screen.getByRole("heading", { name: "Tienda en línea" }),
    ).toBeTruthy();
    expect(screen.getByText("Queremos conocer tu experiencia.")).toBeTruthy();
    // El botón de comenzar requiere consentimiento.
    expect(
      (screen.getByRole("button", { name: "Comenzar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await consentAndStart(user);
    await waitFor(() => expect(server.state.started).toBe(1));
    expect(server.state.device).toMatchObject({
      inputMode: expect.any(String),
      deviceType: expect.any(String),
    });

    // Bloque 1: perfil.
    expect(screen.getByText("Parte 1 de 3")).toBeTruthy();
    await fillProfile(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // Bloque 2: SUS (con indicación, sin revelar el nombre del instrumento).
    expect(await screen.findByText("Parte 2 de 3")).toBeTruthy();
    expect(
      screen.getByText("Indica qué tan de acuerdo estás con cada afirmación."),
    ).toBeTruthy();
    expect(screen.queryByText(/SUS|Usabilidad del Sistema/)).toBeNull();
    expect(
      screen.getByText(/Me pareció fácil usar esta tienda\./),
    ).toBeTruthy();
    await fillSus(user, [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // Bloque 3: NPS y envío.
    expect(await screen.findByText("Parte 3 de 3")).toBeTruthy();
    await pick(user, /recomiendes esta tienda/, /^9\b/);
    await user.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    await screen.findByTestId("thanks");
    expect(screen.getByText(/¡Gracias por participar!/)).toBeTruthy();
    expect(server.state.submits).toBe(1);
    // Lo opcional vacío no se envía.
    expect(server.state.answers).toMatchObject({
      frecuencia: "Semanal",
      canales: ["Web", "App"],
      confianza: 4,
      nps_1: 9,
      sus_1: 5,
      sus_2: 1,
    });
    expect(server.state.answers).not.toHaveProperty("comentario");
    expect(server.state.scores).toEqual([
      {
        blockId: "sus",
        instrumentId: "sus",
        score: { instrument: "sus", score: 100 },
      },
      {
        blockId: "nps",
        instrumentId: "nps",
        score: { instrument: "nps", value: 9, category: "promoter" },
      },
    ]);
  });
});

describe("SurveyRunner · validación", () => {
  it("no avanza con obligatorias vacías, marca las preguntas y se corrige al responder", async () => {
    const { user } = setup();
    await consentAndStart(user);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Parte 1 de 3")).toBeTruthy();
    expect(screen.getAllByText("Responde esta pregunta")).toHaveLength(2); // frecuencia y confianza
    expect(
      screen.getByText("Revisa las preguntas marcadas para continuar."),
    ).toBeTruthy();

    await pick(user, /con qué frecuencia compras/i, "Mensual");
    expect(screen.getAllByText("Responde esta pregunta")).toHaveLength(1);
    await pick(user, /Confío en las tiendas/, /^2$/);
    expect(screen.queryByText("Responde esta pregunta")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Parte 2 de 3")).toBeTruthy();
  });

  it("«Atrás» conserva lo respondido", async () => {
    const { user } = setup();
    await consentAndStart(user);
    await fillProfile(user);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await screen.findByText("Parte 2 de 3");

    await user.click(screen.getByRole("button", { name: "Atrás" }));
    await screen.findByText("Parte 1 de 3");
    const freq = screen.getByRole("group", {
      name: /con qué frecuencia compras/i,
    });
    expect(
      (within(freq).getByRole("radio", { name: "Semanal" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Web" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

describe("SurveyRunner · errores del servidor", () => {
  it("si la liga ya fue usada, avisa antes de pedir nada", async () => {
    setup(createFakeServer({ checkCode: "already_participated" }));
    const blocked = await screen.findByTestId("blocked");
    expect(blocked.textContent).toBe("error:already_participated");
  });

  it("si el cupo está lleno al comenzar, bloquea", async () => {
    const { user } = setup(createFakeServer({ startCode: "full" }));
    await consentAndStart(user);
    expect((await screen.findByTestId("blocked")).textContent).toBe(
      "error:full",
    );
  });

  it("un error recuperable al comenzar muestra el mensaje y permite reintentar", async () => {
    const server = createFakeServer({ startCode: "rate_limited" });
    const { user } = setup(server);
    await user.click(
      screen.getByRole("checkbox", { name: /He leído la información/ }),
    );
    await user.click(screen.getByRole("button", { name: "Comenzar" }));
    await waitFor(() =>
      expect(screen.getByText("error:rate_limited")).toBeTruthy(),
    );
    expect(screen.queryByTestId("blocked")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Comenzar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("si el servidor rechaza los datos, vuelve al último bloque con el aviso", async () => {
    const { server, user } = setup(
      createFakeServer({ submitCodes: ["invalid_data"] }),
    );
    await consentAndStart(user);
    await fillProfile(user);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await fillSus(user, [4, 2, 4, 1, 5, 2, 4, 2, 4, 2]);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await pick(user, /recomiendes esta tienda/, /^7\b/);
    await user.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("error:invalid_data")).toBeTruthy();
    expect(screen.getByText("Parte 3 de 3")).toBeTruthy();
    // Puede corregir y reenviar con éxito.
    await user.click(screen.getByRole("button", { name: "Enviar respuestas" }));
    await screen.findByTestId("thanks");
    expect(server.state.submits).toBe(2);
  });

  it("un fallo transitorio al guardar permite reintentar sin perder lo respondido", async () => {
    const codes = Array(5).fill("server_error"); // agota los reintentos automáticos
    const { server, user } = setup(createFakeServer({ submitCodes: codes }));
    await consentAndStart(user);
    await fillProfile(user);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await fillSus(user, [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await pick(user, /recomiendes esta tienda/, /^10\b/);
    await user.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(
      screen.getByText("Tus respuestas siguen en esta ventana: no la cierres."),
    ).toBeTruthy();
    await user.click(retry);
    await screen.findByTestId("thanks");
    expect(server.state.answers).toMatchObject({ nps_1: 10, sus_1: 5 });
  });
});

describe("SurveyRunner · vista previa", () => {
  it("recorre todo sin llamar al servidor", async () => {
    const { fetchSpy, user } = setup(createFakeServer(), true);
    expect(
      screen.getByText("Vista previa: no se guarda ningún dato."),
    ).toBeTruthy();
    await consentAndStart(user);
    await fillProfile(user);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await fillSus(user, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await pick(user, /recomiendes esta tienda/, /^0\b/);
    await user.click(screen.getByRole("button", { name: "Enviar respuestas" }));
    await screen.findByTestId("thanks");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("SurveyRunner · claridad para quien responde solo", () => {
  const guided: SurveyConfig = {
    version: 1,
    title: "Marca",
    texts: { consent: defaultConsentText("Marca"), thankYou: DEFAULT_THANK_YOU },
    blocks: [
      { kind: "instrument", id: "att", instrumentId: "attitude", subject: "Nespresso", required: true },
      { kind: "price", id: "vw", method: "van_westendorp", subject: "Nespresso", currency: "MXN", required: true },
      { kind: "price", id: "gg", method: "gabor_granger", subject: "Nespresso", prices: [80, 120, 160], required: true },
    ],
  };

  async function open() {
    const user = userEvent.setup();
    render(<SurveyRunner token={TOKEN} config={guided} preview />);
    return user;
  }

  it("la bienvenida dice cuánto dura y que no hay respuestas correctas", async () => {
    await open();
    expect(screen.getByText(/Son 3 partes y toma unos \d+ minutos?\./)).toBeTruthy();
    expect(screen.getByText(/No hay respuestas correctas ni incorrectas/)).toBeTruthy();
    expect(screen.getByText(/sin ayuda de nadie/)).toBeTruthy();
  });

  it("actitud: el enunciado repetido se lee una vez y cada fila muestra sus dos palabras", async () => {
    const user = await open();
    await consentAndStart(user);
    expect(screen.getAllByText("Mi opinión general sobre Nespresso es:")).toHaveLength(1);
    for (const [min, max] of [
      ["Mala", "Buena"],
      ["Desfavorable", "Favorable"],
      ["Desagradable", "Agradable"],
    ]) {
      const row = screen.getByRole("radiogroup", { name: `${min} a ${max}` });
      expect(within(row).getByText(min!)).toBeTruthy();
      expect(within(row).getByText(max!)).toBeTruthy();
      expect(within(row).getAllByRole("radio")).toHaveLength(7);
    }
    // Se puede responder y la selección se conserva.
    const row = screen.getByRole("radiogroup", { name: "Mala a Buena" });
    await user.click(within(row).getByRole("radio", { name: /^6/ }));
    expect((within(row).getByRole("radio", { name: /^6/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("precio: explica qué responder y la moneda va junto al campo, no en el enunciado", async () => {
    const user = await open();
    await consentAndStart(user);
    const rows = screen.getAllByRole("radiogroup");
    for (const r of rows) await user.click(within(r).getAllByRole("radio")[3]!);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Te haremos cuatro preguntas sobre cuánto pagarías/)).toBeTruthy();
    expect(screen.getByText(/de la más baja a la más alta/)).toBeTruthy();
    expect(screen.getAllByText("MXN")).toHaveLength(4);
    expect(screen.queryByText(/precio en/)).toBeNull();
  });

  it("Gabor-Granger: explica que cada precio es hipotético", async () => {
    const user = await open();
    await consentAndStart(user);
    for (const r of screen.getAllByRole("radiogroup")) await user.click(within(r).getAllByRole("radio")[3]!);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    for (const input of screen.getAllByRole("spinbutton")) await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Te mostraremos 3 precios posibles de Nespresso/)).toBeTruthy();
    expect(screen.getByText(/Imagina que ese fuera el precio real/)).toBeTruthy();
  });
});

describe("SurveyRunner · indicaciones por tipo de pregunta", () => {
  const types: SurveyConfig = {
    version: 1,
    title: "Tipos",
    texts: { consent: "c", thankYou: "t" },
    blocks: [
      {
        kind: "questions",
        id: "b1",
        questions: [
          { id: "p1", type: "select", prompt: "¿Cuál prefieres?", required: true, options: ["Café", "Té"] },
          { id: "p2", type: "likert", prompt: "Me gusta el producto", required: true, points: 5 },
          { id: "p3", type: "likert", prompt: "Con etiquetas", required: true, points: 5, minLabel: "Nada", maxLabel: "Mucho" },
          { id: "p4", type: "number", prompt: "¿Cuántas veces al mes?", required: true, min: 0, max: 31 },
          { id: "p5", type: "text", prompt: "¿Algo más?", required: false },
        ],
      },
      { kind: "instrument", id: "nps", instrumentId: "nps", subject: "Nespresso", required: true },
      { kind: "instrument", id: "pi", instrumentId: "purchase_intent", subject: "Nespresso", required: true },
    ],
  };

  async function start() {
    const user = userEvent.setup();
    render(<SurveyRunner token={TOKEN} config={types} preview />);
    await consentAndStart(user);
    return user;
  }

  it("cada tipo dice qué hacer; las escalas sin etiquetas explican el rango", async () => {
    await start();
    expect(screen.getByText("Elige una opción.")).toBeTruthy();
    // Sólo la escala sin etiquetas lleva la indicación; la rotulada ya se explica sola.
    expect(screen.getAllByText("Elige un número del 1 al 5.")).toHaveLength(1);
    expect(screen.getByText("Escribe sólo el número, entre 0 y 31.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Escribe tu respuesta aquí")).toBeTruthy();
  });

  it("NPS e intención de compra abren con su indicación", async () => {
    const user = await start();
    await user.click(screen.getByRole("radio", { name: "Café" }));
    await user.click(screen.getAllByRole("radio", { name: /^3$/ })[0]!);
    await user.click(screen.getAllByRole("radio", { name: /^3\b/ })[1]!);
    await user.type(screen.getByRole("spinbutton"), "3");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Elige un número del 0 al 10.")).toBeTruthy();
    await user.click(screen.getAllByRole("radio")[0]!);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Elige la opción que mejor te represente.")).toBeTruthy();
  });
});
