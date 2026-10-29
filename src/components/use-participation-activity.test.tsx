// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useParticipationActivity } from "./use-participation-activity";
import { HEARTBEAT_MS } from "@/lib/participation-activity";

function Probe({
  preview = false,
  session = "session",
  kind = "study",
}: {
  preview?: boolean;
  session?: string | null;
  kind?: "study" | "battery";
}) {
  const expired = useParticipationActivity("token", session, !preview, kind);
  return <p>{expired ? "expired" : "running"}</p>;
}
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: vi.fn(() => true),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("participation heartbeat", () => {
  it("starts after a session exists, repeats every 30s and cleans up on unmount", async () => {
    const view = render(<Probe />);
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      "/api/s/token/activity",
      expect.objectContaining({
        body: JSON.stringify({ sessionId: "session", away: false }),
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not track previews or missing sessions", async () => {
    const view = render(<Probe preview />);
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<Probe session={null} />);
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("signals hidden/closed pages and stops visible heartbeats until return", async () => {
    render(<Probe kind="battery" />);
    await flush();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/b/token/activity",
      expect.any(Blob),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("falls back to keepalive when the browser cannot queue a beacon", async () => {
    vi.mocked(navigator.sendBeacon).mockReturnValue(false);
    render(<Probe />);
    await flush();
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/s/token/activity",
      expect.objectContaining({
        keepalive: true,
        body: JSON.stringify({ sessionId: "session", away: true }),
      }),
    );
  });
  it("does not infer abandonment from a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<Probe />);
    await flush();
    expect(screen.getByText("running")).toBeTruthy();
  });
  it("shows expiration only when confirmed by the server and stops heartbeats", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ expired: true }, { status: 409 }),
    );
    render(<Probe />);
    await flush();
    expect(screen.getByText("expired")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
