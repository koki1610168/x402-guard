import type { PaymentRequirements } from "@x402/core/types";
import type { GuardErrorCode } from "./utils/errors.js";

/**
 * GuardDecision is the structured "receipt" emitted by x402-guard.
 *
 * Design goals:
 * - **Auditability**: explain *why* an allow/deny happened with minimal but useful context.
 * - **Stability**: this type is intended to be a stable SDK surface (avoid breaking fields).
 * - **Safety**: keep records small; do not include private keys or raw payloads.
 *
 * Privacy note:
 * - Decision records can include `payTo` addresses and token contract addresses (`asset`).
 * - If you ship these to third-party logging, consider redaction or hashing.
 */
export type GuardDecision =
  | {
      decision: "allow";
      at: string;
      request: {
        url?: string;
        method?: string;
      };
      payment?: {
        selected?: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
        rejected?: Array<{
          requirement: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
          reason: "ABOVE_PER_PAYMENT_CAP";
        }>;
        budget?: {
          windowMs?: number;
          totalBeforeBaseUnits?: string;
          totalAfterBaseUnits?: string;
          limitBaseUnits?: string;
        };
      };
      response?: {
        status: number;
        latencyMs: number;
      };
    }
  | {
      decision: "deny";
      at: string;
      request: {
        url?: string;
        method?: string;
      };
      code: GuardErrorCode;
      explanation: string;
      details?: Record<string, unknown>;
      payment?: {
        selected?: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
        rejected?: Array<{
          requirement: Pick<PaymentRequirements, "scheme" | "network" | "amount" | "asset" | "payTo">;
          reason: "ABOVE_PER_PAYMENT_CAP";
        }>;
        budget?: {
          windowMs?: number;
          totalBeforeBaseUnits?: string;
          totalAfterBaseUnits?: string;
          limitBaseUnits?: string;
        };
      };
    };


