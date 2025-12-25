import type { PaymentRequirements } from "@x402/core/types";
import type { GuardPolicy } from "./policy.js";
import { parseUsdcAmountBaseUnits, usdToUsdcBaseUnits } from "./policy.js";

export type RequirementRejection = {
  requirement: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
  reason: "ABOVE_PER_PAYMENT_CAP";
};

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


