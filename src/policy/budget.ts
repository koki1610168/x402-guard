export type SpendEvent = {
  ts: number;
  amountBaseUnits: bigint;
};

/**
 * RollingBudget tracks spend events and enforces a rolling-window budget cap.
 *
 * Why rolling (not fixed epochs)?
 * - It is harder to “game” at window boundaries.
 * - It matches how agents actually fail: they retry continuously during incidents.
 *
 * This is intentionally simple (in-memory, single-process) for hackathon/demo purposes.
 * Production deployments would persist/replicate spend state and include idempotency keys.
 */
export class RollingBudget {
  private readonly windowMs: number;
  private readonly limitBaseUnits: bigint;
  private events: SpendEvent[] = [];

  constructor(windowMs: number, limitBaseUnits: bigint) {
    this.windowMs = windowMs;
    this.limitBaseUnits = limitBaseUnits;
  }

  getTotal(now = Date.now()): bigint {
    this.prune(now);
    return this.events.reduce((acc, e) => acc + e.amountBaseUnits, 0n);
  }

  canSpend(amountBaseUnits: bigint, now = Date.now()): { ok: true } | { ok: false; total: bigint } {
    const total = this.getTotal(now);
    if (total + amountBaseUnits > this.limitBaseUnits) return { ok: false, total };
    return { ok: true };
  }

  record(amountBaseUnits: bigint, now = Date.now()): void {
    this.prune(now);
    this.events.push({ ts: now, amountBaseUnits });
  }

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    // Keep it simple; demo-scale.
    this.events = this.events.filter((e) => e.ts >= cutoff);
  }
}


