export const MIN_ACTION_DELAY_MS = 5_000;
export const MAX_ACTION_DELAY_MS = 10_000;

export function getRandomDelayMs(
  minMs = MIN_ACTION_DELAY_MS,
  maxMs = MAX_ACTION_DELAY_MS,
): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export async function delayRandom(
  record?: (step: string) => void,
  step = 'delay',
  onScheduled?: (delayMs: number) => void,
): Promise<number> {
  record?.(step);
  const delay = getRandomDelayMs();
  onScheduled?.(delay);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}
