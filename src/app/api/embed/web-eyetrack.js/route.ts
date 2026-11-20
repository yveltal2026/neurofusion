import { NextResponse } from "next/server";

const EMBED_SCRIPT = `(function () {
  if (window.__aesterosWebEyeLoaded) return;
  window.__aesterosWebEyeLoaded = true;

  var scriptEl = document.currentScript;
  var scriptSrc = scriptEl ? scriptEl.src : "";
  var apiOrigin = scriptSrc ? new URL(scriptSrc).origin : "";
  if (!apiOrigin) return;

  var params = new URLSearchParams(window.location.search);
  var token = params.get("nf_token") || sessionStorage.getItem("aesteros_nf_token");
  if (!token) return;
  sessionStorage.setItem("aesteros_nf_token", token);

  var storageKey = "aesteros_we_state_" + token;
  var state = null;
  try {
    state = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch (e) {
    state = null;
  }

  var sampleQueue = [];
  var startedAt = Date.now();

  function saveState() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {}
  }

  function currentStep() {
    if (!state || !state.steps) return null;
    return state.steps[state.stepIndex] || null;
  }

  function flush(isFinal) {
    if (!state || !state.sessionId) return;
    if (!sampleQueue.length && !isFinal) return;
    var batch = sampleQueue.splice(0, 500);
    var payload = JSON.stringify({
      sessionId: state.sessionId,
      stepEvents: state.stepEvents || [],
      samples: batch,
      final: !!isFinal
    });
    var url = apiOrigin + "/api/s/" + encodeURIComponent(token) + "/web-eyetrack/events";
    if (isFinal && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(function () {});
  }

  function pushSample(kind, clientX, clientY) {
    var step = currentStep();
    if (!step) return;
    var vw = Math.max(window.innerWidth || 1, 100);
    var vh = Math.max(window.innerHeight || 1, 100);
    var docEl = document.documentElement;
    var docW = Math.max(docEl.scrollWidth || vw, vw);
    var docH = Math.max(docEl.scrollHeight || vh, vh);
    sampleQueue.push({
      t: Math.max(0, Date.now() - startedAt),
      x: Math.max(0, Math.min(1, clientX / vw)),
      y: Math.max(0, Math.min(1, clientY / vh)),
      scrollX: Math.max(0, window.scrollX || 0),
      scrollY: Math.max(0, window.scrollY || 0),
      vw: vw,
      vh: vh,
      docW: docW,
      docH: docH,
      stepId: step.id,
      kind: kind
    });
  }

  function renderBar() {
    var existing = document.getElementById("aesteros-we-bar");
    if (existing) existing.remove();
    var step = currentStep();
    if (!step) return;

    var bar = document.createElement("div");
    bar.id = "aesteros-we-bar";
    bar.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:360px;background:#111827;color:#f9fafb;padding:14px 16px;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.45;";

    var header = document.createElement("div");
    header.style.cssText = "font-size:11px;opacity:.75;margin-bottom:4px;font-weight:600;";
    header.textContent = "Paso " + (state.stepIndex + 1) + " de " + state.steps.length + " · " + step.title;

    var instr = document.createElement("p");
    instr.style.cssText = "margin:0 0 10px 0;";
    instr.textContent = step.instruction;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText =
      "background:#f59e0b;color:#111827;border:none;border-radius:8px;padding:7px 12px;font-weight:600;font-size:12px;cursor:pointer;";
    btn.textContent = state.stepIndex + 1 >= state.steps.length ? "Finalizar estudio" : "Siguiente paso";
    btn.onclick = function () {
      advanceStep("manual");
    };

    bar.appendChild(header);
    bar.appendChild(instr);
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  function advanceStep(trigger) {
    var step = currentStep();
    if (!step) return;
    var now = Math.max(0, Date.now() - startedAt);
    var ev = state.stepEvents[state.stepIndex];
    if (ev) {
      ev.completedAtMs = now;
      ev.completed = true;
      ev.trigger = trigger || "manual";
    }
    if (state.stepIndex + 1 >= state.steps.length) {
      flush(true);
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem("aesteros_nf_token");
      window.location.href = apiOrigin + "/s/" + encodeURIComponent(token) + "?done=1";
      return;
    }
    state.stepIndex += 1;
    var next = currentStep();
    state.stepEvents.push({
      stepId: next.id,
      startedAtMs: now,
      completedAtMs: null,
      completed: false,
      trigger: "manual"
    });
    saveState();
    renderBar();
  }

  function startListeners() {
    var lastMove = 0;
    window.addEventListener("mousemove", function (e) {
      var now = Date.now();
      if (now - lastMove < 120) return;
      lastMove = now;
      pushSample("gaze", e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener("click", function (e) {
      pushSample("click", e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener("pagehide", function () {
      flush(false);
    });
    setInterval(function () {
      flush(false);
    }, 2000);
    renderBar();
  }

  if (state && state.sessionId) {
    var step = currentStep();
    if (step && step.advanceOn === "url_match" && step.urlPattern && window.location.href.indexOf(step.urlPattern) !== -1) {
      advanceStep("url_match");
    }
    startListeners();
    return;
  }

  fetch(apiOrigin + "/api/s/" + encodeURIComponent(token) + "/web-eyetrack/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      viewport: { width: window.innerWidth || 1280, height: window.innerHeight || 720 },
      deviceType: window.innerWidth < 768 ? "mobile" : "desktop"
    })
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.sessionId || !data.steps || !data.steps.length) return;
      state = {
        sessionId: data.sessionId,
        steps: data.steps,
        stepIndex: 0,
        stepEvents: [{
          stepId: data.steps[0].id,
          startedAtMs: 0,
          completedAtMs: null,
          completed: false,
          trigger: "manual"
        }]
      };
      saveState();
      startListeners();
    })
    .catch(function () {});
})();
`;

export async function GET() {
  return new NextResponse(EMBED_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
