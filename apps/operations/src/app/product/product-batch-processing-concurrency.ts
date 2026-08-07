export const PRODUCT_UPLOAD_BATCH_CONCURRENCY = 10;
export const PRODUCT_IMAGE_BATCH_CONCURRENCY = 4;
export const PRODUCT_AI_BATCH_CONCURRENCY = 3;

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }));
}
