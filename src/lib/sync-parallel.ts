/** Run async tasks with a fixed concurrency limit. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];

  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        const value = await mapper(items[index], index);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/** Default: run all pending steps at once. Set SYNC_FETCH_CONCURRENCY to cap (e.g. 6). */
export function resolveSyncFetchConcurrency(itemCount: number): number {
  if (itemCount <= 0) return 1;

  const configured = process.env.SYNC_FETCH_CONCURRENCY;
  if (configured != null && configured !== "") {
    const limit = Number(configured);
    if (Number.isFinite(limit) && limit > 0) {
      return Math.min(Math.floor(limit), itemCount);
    }
  }

  return itemCount;
}
