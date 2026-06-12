export interface IdleTriggerState {
  enabled: boolean;
  running: boolean;
  remainingMs: number;
}

const listeners = new Set<(state: IdleTriggerState) => void>();

let currentState: IdleTriggerState = {
  enabled: false,
  running: false,
  remainingMs: 0,
};

export function getIdleTriggerState(): IdleTriggerState {
  return { ...currentState };
}

export function onIdleTriggerStateChange(
  listener: (state: IdleTriggerState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setIdleTriggerState(
  patch: Partial<IdleTriggerState>,
): IdleTriggerState {
  currentState = {
    ...currentState,
    ...patch,
  };

  for (const listener of listeners) {
    listener(getIdleTriggerState());
  }

  return getIdleTriggerState();
}
