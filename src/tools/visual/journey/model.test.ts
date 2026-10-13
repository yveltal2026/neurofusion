import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTAS } from "./calibration";
import { allocate, computeIfd, generatePanel, runSite, sensitivity, type SiteRatings, type TaskInput } from "./model";

const TASKS: TaskInput[] = [
  { id: "T1", name: "Búsqueda", kind: "busqueda" },
  { id: "T2", name: "Resultados", kind: "resultados" },
  { id: "T3", name: "Ficha", kind: "ficha" },
  { id: "T4", name: "Carrito", kind: "carrito" },
  { id: "T5", name: "Categorías", kind: "categorias" },
];

// Calificaciones de "Demo SA" del estudio de humo de NeuroSEO (datos ficticios).
const DEMO: SiteRatings = {
  frictions: {
    login_obligatorio_carrito: 0,
    resenas_visibles: 0.5,
    relevancia_resultados: 0,
    claridad_ficha: 0.7,
    claridad_msi: 0,
    arquitectura_nav: 0.7,
    confianza_vendedor: 0.7,
  },
  baseSuccess: { T1: 0.8, T2: 0.72, T3: 0.7, T4: 0.6, T5: 0.68 },
};

describe("IFD ifd-1.0 (fórmula idéntica a NeuroSEO)", () => {
  it("reproduce los IFD del estudio demo a partir de sus resúmenes", () => {
    expect(computeIfd({ successAvg: 74.0, susAvg: 63.4, trustAvg: 3.62, abandonPct: 0 })).toEqual({ version: "ifd-1.0", score: 76.2, ifd: 23.8, reading: "media" });
    expect(computeIfd({ successAvg: 77.5, susAvg: 64.7, trustAvg: 4.16, abandonPct: 0 }).ifd).toBe(20.1);
    expect(computeIfd({ successAvg: 63.2, susAvg: 59.7, trustAvg: 2.6, abandonPct: 56.2 })).toMatchObject({ ifd: 43.8, reading: "alta" });
  });
});

describe("panel", () => {
  it("reparte cuotas por mayor residuo sin perder sujetos", () => {
    const a = allocate(DEFAULT_QUOTAS.age, 80);
    expect(a).toEqual({ "18-24": 11, "25-34": 21, "35-44": 19, "45-54": 14, "55-64": 10, "65+": 5 });
    expect(Object.values(allocate({ a: 33.3, b: 33.3, c: 33.4 }, 10)).reduce((x, y) => x + y)).toBe(10);
  });
  it("es reproducible con la misma semilla", () => {
    expect(generatePanel(DEFAULT_QUOTAS, 200, 7)).toEqual(generatePanel(DEFAULT_QUOTAS, 200, 7));
    expect(generatePanel(DEFAULT_QUOTAS, 200, 7)).not.toEqual(generatePanel(DEFAULT_QUOTAS, 200, 8));
  });
});

describe("simulación", () => {
  const panel = generatePanel(DEFAULT_QUOTAS, 5000, 20261013);

  it("el éxito por tarea ≈ base + ajuste demográfico medio (+0.033) + fricciones", () => {
    const { summary } = runSite(panel, DEMO, TASKS, 20261013);
    // T1 sin fricciones activas: 0.80 + 0.033 ≈ 83 %
    expect(summary.successByTask.T1).toBeGreaterThan(81);
    expect(summary.successByTask.T1).toBeLessThan(85.5);
    // T2 = .72 + .033 + .06·.5 ≈ 78 %
    expect(summary.successByTask.T2).toBeGreaterThan(76);
    expect(summary.successByTask.T2).toBeLessThan(80.5);
    expect(summary.abandonPct).toBe(0);
    expect(summary.simulationNoisePts).toBeLessThan(1.5);
    expect(summary.byAge.reduce((a, g) => a + g.n, 0)).toBe(5000);
  });

  it("queda en el mismo rango que el demo original (IFD 23.8, media)", () => {
    const { ifd } = runSite(panel, DEMO, TASKS, 20261013);
    expect(ifd.reading).toBe("media");
    expect(Math.abs(ifd.ifd - 23.8)).toBeLessThan(3);
  });

  it("números aleatorios comunes: mismas calificaciones → mismo resultado, aunque cambie el login", () => {
    const a = runSite(panel, DEMO, TASKS, 99);
    const b = runSite(panel, DEMO, TASKS, 99);
    expect(a).toEqual(b);
    // Con login obligatorio sólo cambia el abandono: confianza (que no depende del login) es idéntica.
    const c = runSite(panel, { ...DEMO, frictions: { ...DEMO.frictions, login_obligatorio_carrito: 1 } }, TASKS, 99);
    expect(c.summary.trustAvg).toBe(a.summary.trustAvg);
    expect(c.summary.successByTask).toEqual(a.summary.successByTask);
    expect(c.summary.abandonPct).toBeGreaterThan(20);
    expect(c.ifd.ifd).toBeGreaterThan(a.ifd.ifd);
  });

  it("acepta tareas arbitrarias (no sólo T1–T5)", () => {
    const tasks: TaskInput[] = [
      { id: "T1", name: "Cotizar", kind: "otra" },
      { id: "T7", name: "Pagar", kind: "carrito" },
    ];
    const { summary } = runSite(panel.slice(0, 500), { ...DEMO, baseSuccess: { T1: 0.5, T7: 0.5 } }, tasks, 1);
    expect(Object.keys(summary.successByTask)).toEqual(["T1", "T7"]);
  });

  it("la sensibilidad muestra que login y la base del carrito mueven más el IFD", () => {
    const rows = sensitivity(DEFAULT_QUOTAS, DEMO, TASKS, 5, 1500);
    expect(rows[0].item).toBe("login_obligatorio_carrito");
    const conf = rows.find((r) => r.item === "confianza_vendedor")!;
    expect(conf.up).toBeLessThan(conf.base);
    expect(conf.down).toBeGreaterThan(conf.base);
  });
});
