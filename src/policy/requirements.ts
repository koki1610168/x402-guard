import type { PaymentRequirements } from "@x402/core/types";
import type { GuardPolicy } from "./policy.js";
import { parseUsdcAmountBaseUnits, usdToUsdcBaseUnits } from "./policy.js";

/**
 * Payment requirement evaluation (pre-payment guardrails).
 *
 * In x402, resource servers can advertise multiple payment options in `accepts` (PaymentRequirements[]).
 * Most clients will select a requirement using a default selector (often "first acceptable option").
 *
 * This module provides a **pure, deterministic, testable** transformation over that list:
 * - filter out options that violate policy (e.g. above per-payment cap)
 * - optionally sort remaining options cheapest-first (so default selection doesn't overpay)
 *
 * Why this is important:
 * - It runs **before signing**, which is the strongest safety lever (no signature → no payment).
 * - It avoids burying policy in side effects or heuristics; the output is explainable and auditable.
 *
 * Limitations:
 * - Amount parsing currently assumes USDC-like semantics via `amount` base units (x402 v2).
 * - Requirements with non-parseable amounts are treated as unacceptable (fail-closed).
 */
export type RequirementRejection = {
  /**
   * Minimal requirement snapshot for audit logs.
   * Keep this small and stable so it can be safely emitted in decision records.
   */
  requirement: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
  reason: "ABOVE_PER_PAYMENT_CAP";
};

/**
 * Evaluate server-provided payment requirements against a guard policy.
 *
 * @returns
 * - `acceptable`: requirements that remain after applying policy
 * - `rejected`: rejected requirements with a reason code for auditability
 */
export function evaluatePaymentRequirements(
  policy: GuardPolicy,
  reqs: PaymentRequirements[],
): { acceptable: PaymentRequirements[]; rejected: RequirementRejection[] } {
  let acceptable = reqs;
  const rejected: RequirementRejection[] = [];

  if (policy.maxPerPaymentUsd !== undefined) {
    const cap = usdToUsdcBaseUnits(policy.maxPerPaymentUsd);
    acceptable = acceptable.filter((r) => {
      const amount = parseUsdcAmountBaseUnits(r);
      if (amount === null) return false;
      if (amount <= cap) return true;
      rejected.push({
        requirement: { scheme: r.scheme, network: r.network, amount: r.amount, asset: r.asset, payTo: r.payTo },
        reason: "ABOVE_PER_PAYMENT_CAP",
      });
      return false;
    });
  }

  if (policy.selectCheapest) {
    acceptable = [...acceptable].sort((a, b) => {
      const av = parseUsdcAmountBaseUnits(a) ?? 0n;
      const bv = parseUsdcAmountBaseUnits(b) ?? 0n;
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
  }

  return { acceptable, rejected };
}


