/**
 * Public SDK entrypoint.
 *
 * Import from here in applications:
 * - `X402Guard` to wrap x402 fetch flows with explicit policies
 * - `GuardPolicy` / helpers to configure deterministic guardrails
 * - `GuardError` to handle allow/deny outcomes cleanly
 */
export { X402Guard, type X402GuardConfig } from "./guard.js";
export { GuardError, type GuardErrorCode } from "./utils/errors.js";
export { type GuardDecision } from "./receipt.js";
export {
  type GuardPolicy,
  type GuardConditions,
  type BudgetWindowPolicy,
  parseUsdcAmountBaseUnits,
  usdToUsdcBaseUnits,
  validatePolicy,
} from "./policy/policy.js";
