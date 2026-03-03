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
): Promise<void> {
  record?.(step);
  const delay = getRandomDelayMs();
  await new Promise((resolve) => setTimeout(resolve, delay));
}
