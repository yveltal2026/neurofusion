import type { Side } from "../engine/types";

/**
 * Máquina de estados de UN ensayo (pura y testeable). Reglas (estilo Project
 * Implicit):
 *  - El RT se mide desde que aparece el estímulo (t0) hasta la respuesta CORRECTA.
 *  - Si la primera respuesta es incorrecta se muestra una X roja y el ensayo no
 *    avanza hasta corregir; el tiempo de corrección queda incluido en el RT.
 *  - `pressed` conserva la PRIMERA respuesta; `error` indica si fue incorrecta.
 */
export interface TrialState {
  t0: number;
  firstPress: Side | null;
  showError: boolean;
}

export interface TrialOutcome {
  rtMs: number;
  pressed: Side;
  error: boolean;
}

export function startTrial(t0: number): TrialState {
  return { t0, firstPress: null, showError: false };
}

export function handlePress(
  state: TrialState,
  pressed: Side,
  correct: Side,
  now: number,
): { state: TrialState; outcome: TrialOutcome | null } {
  const firstPress = state.firstPress ?? pressed;
  if (pressed === correct) {
    return {
      state: { ...state, firstPress, showError: false },
      outcome: { rtMs: now - state.t0, pressed: firstPress, error: firstPress !== correct },
    };
  }
  return { state: { ...state, firstPress, showError: true }, outcome: null };
}
