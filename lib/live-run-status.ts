export interface LiveRunStatus {
  nextActionLabel: string | null;
  nextActionAt: number | null;
  isActive: boolean;
}

const EVENT_NAME = 'intouch:live-run-status';

export function publishLiveRunStatus(status: LiveRunStatus): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LiveRunStatus>(EVENT_NAME, { detail: status }));
}

export function clearLiveRunStatus(): void {
  publishLiveRunStatus({
    nextActionLabel: null,
    nextActionAt: null,
    isActive: false,
  });
}

export function subscribeLiveRunStatus(
  callback: (status: LiveRunStatus) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    const custom = event as CustomEvent<LiveRunStatus>;
    callback(custom.detail);
  };

  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
}
