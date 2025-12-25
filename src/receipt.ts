import type { PaymentRequirements } from "@x402/core/types";
import type { GuardErrorCode } from "./utils/errors.js";

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


