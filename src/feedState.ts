export interface FeedState<T> {
  data: Record<string, T>;
  updatedAt: Record<string, number>;
  errors: Record<string, boolean>;
}

export const STALE_AFTER_MS = 60_000;

export function mergeFeedResults<T>(
  previous: FeedState<T>,
  results: ReadonlyArray<{ id: string; data: T | null }>,
  timestamp: number,
): FeedState<T> {
  const next = {
    data: { ...previous.data },
    updatedAt: { ...previous.updatedAt },
    errors: { ...previous.errors },
  };
  for (const result of results) {
    if (result.data === null) {
      next.errors[result.id] = true;
    } else {
      next.data[result.id] = result.data;
      next.updatedAt[result.id] = timestamp;
      delete next.errors[result.id];
    }
  }
  return next;
}

export function isFeedStale<T>(state: FeedState<T>, id: string, now: number): boolean {
  return Boolean(state.errors[id]) || state.updatedAt[id] === undefined || now - state.updatedAt[id] >= STALE_AFTER_MS;
}
