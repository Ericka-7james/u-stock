export async function withBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelayMs = 250
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const status = err?.status ?? err?.response?.status;

      if (attempt > maxRetries || (status && status < 500 && status !== 429)) {
        throw err;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
