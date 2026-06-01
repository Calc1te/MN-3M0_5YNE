export const BARTENDER_STATES = [
  "idle",
  "shaking",
  "smoking",
  "lookingAtYou",
] as const;

export type BartenderState = (typeof BARTENDER_STATES)[number];

const listeners = new Set<(state: BartenderState) => void>();
let currentState: BartenderState = "idle";

export function getBartenderState(): BartenderState {
  return currentState;
}

export function onBartenderStateChange(
  listener: (state: BartenderState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function normalizeBartenderState(value: string): BartenderState {
  const trimmed = value.trim().toLowerCase();
  const aliased = trimmed === "lookingatyou" ? "lookingAtYou" : trimmed;
  if (isBartenderState(aliased)) {
    return aliased;
  }
  throw new Error(
    `Unknown bartender state: ${value}. Expected one of ${BARTENDER_STATES.join(", ")}.`,
  );
}

export function changeBartenderState(value: string): BartenderState {
  const next = normalizeBartenderState(value);
  if (next === currentState) {
    return currentState;
  }
  currentState = next;
  for (const listener of listeners) {
    listener(currentState);
  }
  return currentState;
}

export function isBartenderState(value: string): value is BartenderState {
  return (BARTENDER_STATES as readonly string[]).includes(value);
}
