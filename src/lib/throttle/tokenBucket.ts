export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(private capacity: number, private refillPerSecond: number) {
    this.tokens = capacity;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;

    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerSecond
    );
    this.lastRefill = now;
  }

  async consumeOrWait(cost = 1) {
    while (true) {
      this.refill();
      if (this.tokens >= cost) {
        this.tokens -= cost;
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
