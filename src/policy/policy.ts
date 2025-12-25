import type { PaymentRequirements } from "@x402/core/types";

/**
 * Policy types are intentionally small and explicit:
 * - easy to audit
 * - deterministic to enforce
 * - stable as a public SDK surface
 *
 * Units:
 * - USD values assume USDC semantics (6 decimals) when converted to base units.
 * - PaymentRequirements for x402 v2 contains `{ asset, amount }` where `amount` is a string in base units.
 */
export type GuardConditions = {
  requireHttp2xx?: boolean;
  maxLatencyMs?: number;
  requiredJsonFields?: string[];
};

export type BudgetWindowPolicy = {
  /** Maximum total spend (USD for USDC) allowed inside the rolling window. */
  limitUsd: number;
  /** Rolling window length in milliseconds. */
  windowMs: number;
};

export type GuardPolicy = {
  /**
   * Maximum single payment amount (USD for USDC).
   * Example: 0.10 means “never pay more than $0.10 for one request”.
   */
  maxPerPaymentUsd?: number;

  /** Rolling spend limit inside a time window (USD for USDC). */
  budget?: BudgetWindowPolicy;

  /** Response quality checks (note: cannot prevent the *first* payment, but can prevent retry-drain). */
  conditions?: GuardConditions;

  /** If true, prefer the cheapest `amount` among acceptable requirements. */
  selectCheapest?: boolean;
};

/**
 * Validates policy configuration early so guard behavior is predictable.
 * Guard is fail-closed: invalid policies should throw immediately rather than silently mis-enforce.
 */
export function validatePolicy(policy: GuardPolicy): void {
  if (policy.maxPerPaymentUsd !== undefined && !(policy.maxPerPaymentUsd > 0)) {
    throw new Error("policy.maxPerPaymentUsd must be > 0");
  }
  if (policy.budget) {
    if (!(policy.budget.limitUsd > 0)) throw new Error("policy.budget.limitUsd must be > 0");
    if (!(policy.budget.windowMs > 0)) throw new Error("policy.budget.windowMs must be > 0");
  }
  if (policy.conditions?.maxLatencyMs !== undefined && !(policy.conditions.maxLatencyMs > 0)) {
    throw new Error("policy.conditions.maxLatencyMs must be > 0");
  }
  if (policy.conditions?.requiredJsonFields) {
    if (!Array.isArray(policy.conditions.requiredJsonFields)) {
      throw new Error("policy.conditions.requiredJsonFields must be an array of strings");
    }
  }
}

/**
 * Parses x402 v2 `PaymentRequirements.amount` (string base units) into a bigint.
 *
 * NOTE: This assumes USDC-like 6 decimal semantics when later converted to USD display.
 * If the server returns a different asset/decimals, callers should not interpret this as USD.
 */
export function parseUsdcAmountBaseUnits(req: PaymentRequirements): bigint | null {
  // V2 PaymentRequirements includes `{ asset, amount }` where amount is base units (string).
  if (!req || typeof req.amount !== "string") return null;
  try {
    return BigInt(req.amount);
  } catch {
    return null;
  }
}

/**
 * Converts a USD value to USDC base units (6 decimals).
 *
 * We round down (floor) to be conservative:
 * - caps/budgets become slightly stricter rather than permissive due to floating point issues.
 */
export function usdToUsdcBaseUnits(usd: number): bigint {
  // USDC uses 6 decimals. We round *down* (fail-closed conservative).
  const scaled = Math.floor(usd * 1_000_000);
  return BigInt(scaled);
}


