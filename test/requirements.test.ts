import { describe, expect, test } from "vitest";
import type { PaymentRequirements } from "@x402/core/types";

import { usdToUsdcBaseUnits } from "../src/policy/policy.js";
import { evaluatePaymentRequirements } from "../src/policy/requirements.js";

function req(amountBaseUnits: bigint): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:84532",
    asset: "USDC",
    amount: amountBaseUnits.toString(),
    payTo: "0xdeadbeef",
    maxTimeoutSeconds: 60,
    extra: {},
  };
}

test("usdToUsdcBaseUnits rounds down (conservative)", () => {
  expect(usdToUsdcBaseUnits(0.1)).toBe(100000n);
  expect(usdToUsdcBaseUnits(0.000019)).toBe(19n);
  expect(usdToUsdcBaseUnits(0.0000199)).toBe(19n);
});

describe("policy behavior (sanity)", () => {
  test("per-payment cap rejects expensive requirements", () => {
    const capUsd = 0.10;
    const { acceptable, rejected } = evaluatePaymentRequirements(
      { maxPerPaymentUsd: capUsd, selectCheapest: false },
      [req(5_000_000n), req(50_000n)],
    );
    expect(acceptable.map((r) => r.amount)).toEqual([req(50_000n).amount]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBe("ABOVE_PER_PAYMENT_CAP");
  });

  test("selectCheapest sorts remaining options by amount ascending", () => {
    const { acceptable } = evaluatePaymentRequirements(
      { selectCheapest: true },
      [req(100n), req(10n), req(50n)],
    );
    expect(acceptable.map((r) => r.amount)).toEqual(["10", "50", "100"]);
  });
});


