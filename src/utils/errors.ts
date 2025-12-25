export type GuardErrorCode =
  | "POLICY_INVALID"
  | "PAYMENT_BLOCKED_PER_PAYMENT_CAP"
  | "PAYMENT_BLOCKED_BUDGET_WINDOW"
  | "PAYMENT_BLOCKED_NO_ACCEPTABLE_REQUIREMENTS"
  | "RESPONSE_CONDITION_FAILED";

/**
 * GuardError is the single error type thrown by x402-Guard.
 *
 * Design goals:
 * - **Machine-readable**: stable `code` for programmatic handling and metrics
 * - **Human-readable**: `explanation` for logs and demos
 * - **Actionable context**: optional `details` for debugging/audit trails
 */
export class GuardError extends Error {
  readonly code: GuardErrorCode;
  readonly explanation: string;
  readonly details?: Record<string, unknown>;

  constructor(code: GuardErrorCode, explanation: string, details?: Record<string, unknown>) {
    super(`${code}: ${explanation}`);
    this.name = "GuardError";
    this.code = code;
    this.explanation = explanation;
    this.details = details;
  }
}


