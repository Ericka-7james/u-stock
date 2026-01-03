import type { MarketTick } from "../../types/market";

export class TickBuffer {
  private buf: MarketTick[] = [];

  push(tick: MarketTick) {
    this.buf.push(tick);
  }

  drain(): MarketTick[] {
    const out = this.buf;
    this.buf = [];
    return out;
  }
}
