/**
 * Rojo → ámbar → verde según puntuación 0–100 (con texto siempre visible: no depende sólo
 * del color). Módulo neutro para usarlo desde componentes de servidor y de cliente.
 */
export const scoreColor = (s: number) => (s >= 85 ? "#009E73" : s >= 60 ? "#E69F00" : "#D55E00");
