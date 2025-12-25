import { wrapFetchWithPayment, type x402Client } from "@x402/fetch";
import type { PaymentRequirements } from "@x402/core/types";

import { RollingBudget } from "./policy/budget.js";
import { enforceResponseConditions } from "./policy/conditions.js";
import { parseUsdcAmountBaseUnits, usdToUsdcBaseUnits, validatePolicy, type GuardPolicy } from "./policy/policy.js";
import { evaluatePaymentRequirements } from "./policy/requirements.js";
import { GuardError } from "./utils/errors.js";
import type { GuardDecision } from "./receipt.js";

export type X402GuardConfig = {
  /**
   * A configured x402 client (schemes registered, signer set up).
   * x402-guard does not modify x402; it wraps the client with policy.
   */
  client: x402Client;
  policy: GuardPolicy;

  /**
   * Optional audit hook for production logging / demos.
   * Called on allow/deny with a structured decision record.
   *
   * NOTE: current implementation is single-flight oriented (demo use); concurrent requests may
   * interleave decision context. Production would attach per-request context explicitly.
   */
  onDecision?: (record: GuardDecision) => void;
};

/**
 * X402Guard is a **policy enforcement layer** for x402 payments.
 *
 * The key design principle is separation of concerns:
 * - x402 determines *how* payment headers are negotiated/signed/settled.
 * - x402-guard determines *when* a payment should be blocked.
 *
 * Enforcement points:
 * - **Before payment** (safe / preferred): filter payment requirements and abort signing.
 *   - per-payment caps (overpricing)
 *   - selecting cheapest among acceptable requirements
 *   - rolling budget windows (retry-drain)
 * - **After response** (cannot prevent the first payment in pay-to-access flows):
 *   - response conditions (status/latency/schema) to stop “pay + junk + retry + pay” loops
 *
 * Note: In a pay-to-access model, the client typically must pay to receive the protected response.
 * Guardrails therefore focus on (a) preventing obviously-bad payments up front, and (b) preventing
 * repeated loss due to retries or low-quality responses.
 */
export class X402Guard {
  private readonly policy: GuardPolicy;
  private readonly budget?: RollingBudget;
  private readonly client: x402Client;
  private readonly paidFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  private readonly onDecision?: (record: GuardDecision) => void;

  // Best-effort context for audit records (demo-oriented; not concurrency-safe).
  private lastSelected?: PaymentRequirements;
  private lastRejected: Array<{
    requirement: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
    reason: "ABOVE_PER_PAYMENT_CAP";
  }> = [];
  private lastBudgetBefore?: bigint;
  private lastBudgetAfter?: bigint;

  constructor(fetchImpl: typeof fetch, config: X402GuardConfig) {
    try {
      validatePolicy(config.policy);
    } catch (e) {
      throw new GuardError("POLICY_INVALID", "Invalid guard policy.", { error: String(e) });
    }

    this.policy = config.policy;
    this.client = config.client;
    this.onDecision = config.onDecision;

    if (this.policy.budget) {
      this.budget = new RollingBudget(
        this.policy.budget.windowMs,
        usdToUsdcBaseUnits(this.policy.budget.limitUsd),
      );
    }

    // Filter unacceptable requirements (e.g., per-payment cap) before selection.
    this.client.registerPolicy((version, reqs) => this.applyRequirementPolicies(version, reqs));

    // Enforce budget window before signing a payload (abort = no payment).
    this.client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
      const amount = parseUsdcAmountBaseUnits(selectedRequirements as PaymentRequirements);
      if (amount === null) return;

      this.lastSelected = selectedRequirements as PaymentRequirements;
      if (this.budget) this.lastBudgetBefore = this.budget.getTotal();

      if (this.budget) {
        const check = this.budget.canSpend(amount);
        if (!check.ok) {
          // Abort BEFORE payment signature generation. This is the strongest safety lever:
          // no signature → no payment header → no settlement.
          return {
            abort: true,
            reason: `Blocked by budget window policy: total=${check.total.toString()} + next=${amount.toString()} exceeds limit.`,
          };
        }
      }
    });

    // Record spend after payload creation (best-effort accounting for demo).
    this.client.onAfterPaymentCreation(async ({ selectedRequirements }) => {
      const amount = parseUsdcAmountBaseUnits(selectedRequirements as PaymentRequirements);
      if (amount === null) return;
      this.budget?.record(amount);
      if (this.budget) this.lastBudgetAfter = this.budget.getTotal();
    });

    this.paidFetch = wrapFetchWithPayment(fetchImpl, this.client);
  }

  /**
   * Guarded fetch.
   *
   * This delegates payment negotiation to x402, while enforcing:
   * - pre-payment policies via x402 client hooks/policies
   * - post-response conditions via `enforceResponseConditions`
   *
   * If a policy blocks payment or a condition fails, this throws `GuardError`.
   */
  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const startedAt = Date.now();
    this.lastRejected = [];
    this.lastSelected = undefined;
    this.lastBudgetBefore = undefined;
    this.lastBudgetAfter = undefined;

    const reqUrl = typeof input === "string" ? input : input instanceof Request ? input.url : undefined;
    const reqMethod =
      init?.method ?? (input instanceof Request ? input.method : undefined);

    let res: Response;
    try {
      res = await this.paidFetch(input, init);
    } catch (e: any) {
      // The x402 client uses the before-hook abort reason; surface it as a GuardError.
      const msg = typeof e?.message === "string" ? e.message : String(e);
      if (msg.includes("abort") || msg.includes("Blocked by")) {
        const ge = new GuardError("PAYMENT_BLOCKED_BUDGET_WINDOW", msg);
        this.emitDecision({
          decision: "deny",
          at: new Date().toISOString(),
          request: { url: reqUrl, method: reqMethod },
          code: ge.code,
          explanation: ge.explanation,
          details: ge.details,
          payment: this.buildPaymentAudit(),
        });
        throw ge;
      }
      // Unknown error path: still emit a denial record for observability.
      this.emitDecision({
        decision: "deny",
        at: new Date().toISOString(),
        request: { url: reqUrl, method: reqMethod },
        code: "POLICY_INVALID",
        explanation: msg,
        payment: this.buildPaymentAudit(),
      });
      throw e;
    }

    try {
      await enforceResponseConditions(res, startedAt, this.policy.conditions);
    } catch (e: any) {
      if (e instanceof GuardError) {
        this.emitDecision({
          decision: "deny",
          at: new Date().toISOString(),
          request: { url: reqUrl, method: reqMethod },
          code: e.code,
          explanation: e.explanation,
          details: e.details,
          payment: this.buildPaymentAudit(),
        });
      }
      throw e;
    }

    this.emitDecision({
      decision: "allow",
      at: new Date().toISOString(),
      request: { url: reqUrl, method: reqMethod },
      payment: this.buildPaymentAudit(),
      response: { status: res.status, latencyMs: Date.now() - startedAt },
    });
    return res;
  }

  /**
   * Applies deterministic filtering/sorting to the server-provided `accepts` list.
   *
   * This is where we prevent “malicious overpricing”:
   * - filter out requirements above `maxPerPaymentUsd`
   * - optionally sort remaining requirements cheapest-first
   *
   * IMPORTANT: This runs *before* the x402 client selects a requirement to sign.
   */
  private applyRequirementPolicies(_x402Version: number, reqs: PaymentRequirements[]): PaymentRequirements[] {
    const { acceptable, rejected } = evaluatePaymentRequirements(this.policy, reqs);
    this.lastRejected = rejected;

    if (acceptable.length === 0) {
      // Fail-closed: if we filtered everything, we want selection to fail loudly.
      throw new GuardError(
        "PAYMENT_BLOCKED_NO_ACCEPTABLE_REQUIREMENTS",
        "No acceptable payment requirements remain after applying guard policy.",
        { available: reqs.map((r) => ({ scheme: r.scheme, network: r.network, amount: r.amount, payTo: r.payTo })) },
      );
    }
    return acceptable;
  }

  private emitDecision(record: GuardDecision) {
    try {
      this.onDecision?.(record);
    } catch {
      // Never allow audit hooks to break the payment flow.
    }
  }

  private buildPaymentAudit(): GuardDecision["payment"] {
    const selected = this.lastSelected
      ? {
          scheme: this.lastSelected.scheme,
          network: this.lastSelected.network,
          amount: this.lastSelected.amount,
          asset: this.lastSelected.asset,
          payTo: this.lastSelected.payTo,
        }
      : undefined;

    const budget = this.budget
      ? {
          windowMs: this.policy.budget?.windowMs,
          totalBeforeBaseUnits: this.lastBudgetBefore?.toString(),
          totalAfterBaseUnits: this.lastBudgetAfter?.toString(),
          limitBaseUnits: this.policy.budget ? usdToUsdcBaseUnits(this.policy.budget.limitUsd).toString() : undefined,
        }
      : undefined;

    return {
      selected,
      rejected: this.lastRejected.length > 0 ? this.lastRejected : undefined,
      budget,
    };
  }
}


