"use client";

import dynamic from "next/dynamic";
import type { EyeParticipantStudy } from "./participant.server";

const EyeTrackingLab = dynamic(() => import("@/lab/eyetracking/EyeTrackingLab").then((m) => m.EyeTrackingLab), {
  ssr: false,
  loading: () => <p className="px-4 py-8 text-center">Cargando estudio…</p>,
});

const VideoStudyRunner = dynamic(() => import("@/tools/visual/video/VideoStudyRunner").then((m) => m.VideoStudyRunner), {
  ssr: false,
  loading: () => <p className="px-4 py-8 text-center">Cargando estudio de video…</p>,
});

export function EyeStudyRunner({ token, study, preview }: { token: string; study: EyeParticipantStudy; preview: boolean }) {
  if (study.video) {
    return <VideoStudyRunner token={token} study={study} preview={preview} />;
  }
  return <EyeTrackingLab study={{ token, title: study.name, assets: study.assets, durationSeconds: study.config.eyeTracking.durationSeconds, preview }} />;
}
