export type InputMode = "keyboard" | "touch";
export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface DeviceEnv {
  maxTouchPoints: number;
  /** matchMedia("(pointer: coarse)") — el puntero PRINCIPAL es táctil. */
  coarsePointer: boolean;
  width: number;
  height: number;
}

export interface DeviceInfo {
  inputMode: InputMode;
  deviceType: DeviceType;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Clasifica el dispositivo. Una laptop con pantalla táctil pero ratón/trackpad
 * como puntero principal cuenta como escritorio con teclado. En dispositivos
 * táctiles, el lado corto de la pantalla distingue celular (< 600 px) de tableta.
 */
export function classifyDevice(env: DeviceEnv): DeviceInfo {
  const touch = env.coarsePointer && env.maxTouchPoints > 0;
  const short = Math.min(env.width, env.height);
  const deviceType: DeviceType = !touch ? "desktop" : short < 600 ? "mobile" : "tablet";
  return {
    inputMode: touch ? "touch" : "keyboard",
    deviceType,
    screenWidth: Math.round(env.width),
    screenHeight: Math.round(env.height),
  };
}

export function detectDevice(): DeviceInfo {
  return classifyDevice({
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    width: window.screen?.width || window.innerWidth,
    height: window.screen?.height || window.innerHeight,
  });
}
