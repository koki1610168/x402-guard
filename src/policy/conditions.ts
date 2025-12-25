import { GuardError } from "../utils/errors.js";
import type { GuardConditions } from "./policy.js";

/**
 * Response conditions are evaluated AFTER a response is received.
 *
 * Important limitation:
 * - In a pay-to-access model, the client may need to pay before the server returns the protected body.
 * - Therefore, conditions cannot prevent the *first* payment for a bad service.
 *
 * What conditions *do* prevent:
 * - retry-drain (paying repeatedly for junk/partial responses)
 * - silently accepting invalid results (schema violations)
 */
export async function enforceResponseConditions(
  res: Response,
  startedAtMs: number,
  conditions: GuardConditions | undefined,
): Promise<void> {
  if (!conditions) return;

  const latencyMs = Date.now() - startedAtMs;
  if (conditions.maxLatencyMs !== undefined && latencyMs > conditions.maxLatencyMs) {
    throw new GuardError("RESPONSE_CONDITION_FAILED", "Response exceeded max latency policy.", {
      latencyMs,
      maxLatencyMs: conditions.maxLatencyMs,
      status: res.status,
    });
  }

  if (conditions.requireHttp2xx && !(res.status >= 200 && res.status < 300)) {
    throw new GuardError("RESPONSE_CONDITION_FAILED", "Response status failed policy (expected 2xx).", {
      status: res.status,
      latencyMs,
    });
  }

  if (conditions.requiredJsonFields && conditions.requiredJsonFields.length > 0) {
    let body: unknown;
    try {
      // Clone so we don't consume the caller's response body.
      body = await res.clone().json();
    } catch {
      throw new GuardError("RESPONSE_CONDITION_FAILED", "Response is not valid JSON.", {
        status: res.status,
        latencyMs,
      });
    }

    const missing = conditions.requiredJsonFields.filter((f) => {
      const v = (body as any)?.[f];
      return v === undefined || v === null;
    });
    if (missing.length > 0) {
      throw new GuardError("RESPONSE_CONDITION_FAILED", "Response is missing required JSON fields.", {
        status: res.status,
        latencyMs,
        missing,
      });
    }
  }
}


