"use client";

import { useEffect, useState } from "react";
import { HEARTBEAT_MS } from "@/lib/participation-activity";

/** Closing the page is only an inactivity signal; the server owns the abandonment deadline. */
export function useParticipationActivity(
  token: string | undefined,
  sessionId: string | null,
  enabled: boolean,
  kind: "study" | "battery" = "study",
) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!enabled || !token || !sessionId) return;
    let disposed = false;
    let ended = false;
    let inFlight = false;
    const endpoint = `/api/${kind === "study" ? "s" : "b"}/${token}/activity`;
    const sendAway = () => {
      const body = JSON.stringify({ sessionId, away: true });
      if (
        navigator.sendBeacon?.(
          endpoint,
          new Blob([body], { type: "application/json" }),
        )
      )
        return;
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };
    const sendActive = async () => {
      if (
        disposed ||
        ended ||
        inFlight ||
        document.visibilityState === "hidden"
      )
        return;
      inFlight = true;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, away: false }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 409) {
          const result = await response.json();
          if (result.expired && !disposed) {
            ended = true;
            setExpired(true);
          }
        }
      } catch {
        /* A lost signal is handled by the server deadline, not as immediate abandonment. */
      } finally {
        inFlight = false;
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? sendAway() : void sendActive();
    void sendActive();
    const timer = window.setInterval(() => void sendActive(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", sendAway);
    window.addEventListener("pageshow", sendActive);
    window.addEventListener("online", sendActive);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", sendAway);
      window.removeEventListener("pageshow", sendActive);
      window.removeEventListener("online", sendActive);
    };
  }, [token, sessionId, enabled, kind]);
  return expired;
}
