import { describe, expect, test } from "vitest";
import { RollingBudget } from "../src/policy/budget.js";

describe("RollingBudget", () => {
  test("tracks spend inside a rolling window", () => {
    const b = new RollingBudget(1000, 100n);

    b.record(30n, 1_000);
    b.record(40n, 1_500);
    expect(b.getTotal(1_500)).toBe(70n);

    // After window passes, the first event expires.
    expect(b.getTotal(2_100)).toBe(40n);
  });

  test("canSpend blocks when exceeding limit", () => {
    const b = new RollingBudget(10_000, 100n);
    b.record(90n, 1_000);

    expect(b.canSpend(10n, 1_000)).toEqual({ ok: true });
    const r = b.canSpend(11n, 1_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.total).toBe(90n);
  });
});


