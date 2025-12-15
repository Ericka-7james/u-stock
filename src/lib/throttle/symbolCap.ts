export class SymbolCap {
  private active = new Set<string>();

  constructor(private maxSymbols: number) {}

  tryAdd(symbol: string): boolean {
    if (this.active.has(symbol)) return true;
    if (this.active.size >= this.maxSymbols) return false;
    this.active.add(symbol);
    return true;
  }

  remove(symbol: string) {
    this.active.delete(symbol);
  }

  list(): string[] {
    return [...this.active];
  }
}
