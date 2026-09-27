type LlmRequestStateListener = (activeRequestCount: number) => void;

const listeners = new Set<LlmRequestStateListener>();
let activeRequestCount = 0;

function emit(): void {
  for (const listener of listeners) {
    listener(activeRequestCount);
  }
}

export function getActiveLlmRequestCount(): number {
  return activeRequestCount;
}

export function onLlmRequestStateChange(
  listener: LlmRequestStateListener,
): () => void {
  listeners.add(listener);
  listener(activeRequestCount);
  return () => {
    listeners.delete(listener);
  };
}

export function beginLlmRequest(): () => void {
  activeRequestCount += 1;
  emit();

  let finished = false;
  return () => {
    if (finished) {
      return;
    }
    finished = true;
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    emit();
  };
}

export async function trackLlmRequest<T>(
  request: () => Promise<T>,
): Promise<T> {
  const finish = beginLlmRequest();
  try {
    return await request();
  } finally {
    finish();
  }
}
