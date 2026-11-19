// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VideoAttentionAffectViewer } from "./VideoAttentionAffectViewer";

const sampleAus = {
  au01: 12,
  au02: 10,
  au04: 5,
  au06: 65,
  au07: 8,
  au09: 0,
  au10: 0,
  au12: 80,
  au14: 0,
  au15: 0,
  au24: 0,
  au26: 18,
};

describe("VideoAttentionAffectViewer (alineado con split view, Tabs segmentadas y Fullscreen)", () => {
  it("muestra el visor contenido, botón Fullscreen y las 3 pestañas segmentadas con índices y 12 AUs", () => {
    render(
      <VideoAttentionAffectViewer
        title="Spot 15s"
        playbackUrl="https://cdn.example.com/spot.mp4"
        durationMs={2000}
        aois={[
          {
            id: "logo",
            label: "Logo Marca",
            startMs: 0,
            endMs: 2000,
            box: [0.1, 0.1, 0.4, 0.4],
          },
        ]}
        aggregateAois={[
          {
            id: "logo",
            label: "Logo Marca",
            startMs: 0,
            endMs: 2000,
            viewers: 10,
            hitRatePct: 85,
            ttffMs: 420,
            fixationCount: 2.1,
            totalFixationDurationMs: 650,
            dwellTimeMs: 700,
            visitCount: 1.2,
            revisitCount: 0.2,
            affectWhileLooking: {
              smile: 75,
              friction: 5,
              valence: 70,
              surprise: 14,
              expressiveness: 30,
              aus: sampleAus,
            },
          },
        ]}
        aggregateScenes={[
          {
            id: "intro",
            label: "Apertura",
            startMs: 0,
            endMs: 2000,
            meanGazeCoverageRatio: 0.88,
            meanFixationCount: 3.4,
            meanBlinkRatePerMin: 14,
            meanAffect: {
              smile: 75,
              friction: 5,
              valence: 70,
              surprise: 14,
              expressiveness: 30,
              aus: sampleAus,
            },
          },
        ]}
        timeline={[
          {
            startMs: 0,
            endMs: 1000,
            activeGazeRatio: 1,
            meanValence: 70,
            meanSmile: 75,
            meanFriction: 5,
            meanSurprise: 14,
            meanExpressiveness: 30,
            meanAus: sampleAus,
            blinkRatePct: 4,
          },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: /Índices y AUs/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /AOIs dinámicas/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Escenas/i })).toBeTruthy();
    expect(screen.getByText(/AU12 · Lip Corner Puller/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /AOIs dinámicas/i }));
    expect(screen.getByText("85%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(
      screen.getByRole("dialog", { name: "Spot 15s en pantalla completa" }),
    ).toBeTruthy();
  });
});
