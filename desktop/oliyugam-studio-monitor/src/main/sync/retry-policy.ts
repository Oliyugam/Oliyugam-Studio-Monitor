export const MAX_SYNC_RETRIES = 12;
export const MAX_SYNC_BACKOFF_MS = 15 * 60 * 1_000;

export function shouldPermanentlyFail(retryCount: number, errorCode: string): boolean {
  return retryCount >= MAX_SYNC_RETRIES || errorCode === "VALIDATION_ERROR";
}

export function retryDelayMs(retryCount: number, randomValue = Math.random()): number {
  const exponential = Math.min(MAX_SYNC_BACKOFF_MS, 1_000 * 2 ** Math.min(retryCount, 10));
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  return Math.min(MAX_SYNC_BACKOFF_MS, Math.round(exponential * (0.75 + boundedRandom * 0.5)));
}