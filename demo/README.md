## Demo: Real-World Threats in Autonomous x402 Payments (Why x402-guard Exists)

This demo intentionally recreates what happens when an autonomous agent makes x402 payments **without a safety policy layer**. These failure modes are not theoretical—they’re the kinds of bugs and adversarial behaviors that show up immediately once agents can pay unattended.

### What’s running

- **`demo/malicious-api.ts`**: an x402-enabled “paid API” that behaves adversarially.
- **`demo/naive-agent.ts`**: a client that automatically pays and retries, with minimal validation.

Together, they reproduce three high-impact problems.

---

## Problem 1 — Infinite Retry Drain (unbounded spend via retries)

### What it is

When an agent retries on failures (timeouts, 5xx, malformed JSON), each retry can trigger a **new paid request**. A normal “retry loop” becomes a **money-draining loop**.

### Why it’s real-world

- Retries are standard production behavior (network flakiness, transient server errors, schema mismatches).
- Agents can run continuously with no human oversight.
- Without budget/rate limits, small errors become large losses.

### How the demo shows it

- The malicious API frequently returns unusable responses (`500`, junk JSON, partial JSON).
- The naive agent retries aggressively.
- Each retry can create a new payment, increasing total spend until the loop stops.

**Impact:** a single bug or flaky endpoint can drain funds rapidly and deterministically.

---

## Problem 2 — Malicious Overpricing (default payment selection can be exploited)

### What it is

x402 allows a server to advertise multiple valid payment options (“accepts”). A naive client often selects the first valid option (default SDK behavior unless overridden). An adversarial server can exploit this by placing an expensive option first.

### Why it’s real-world

- Open ecosystems attract third-party endpoints, not all of them honest.
- Even honest services might present multiple payment rails/prices, and clients may pick poorly.
- “Valid payment requirement” ≠ “reasonable price.”

### How the demo shows it

- The malicious API returns multiple payment options for the same endpoint.
- The naive agent consistently chooses the first acceptable option (not the cheapest).

**Impact:** agents systematically overpay while still getting “valid” responses.

---

## Problem 3 — Paying for Fake / Partial Service (no response-quality enforcement)

### What it is

A service can accept payment and still return:

- junk output
- partial results
- missing required fields
- responses that don’t match expected schema

If the agent doesn’t gate payment on response quality, it effectively pays for invalid work.

### Why it’s real-world

- Response validation is often “best effort” in agent code.
- Many agents treat `200 OK` as success even when the body is useless.
- Attackers can profit by returning low-effort junk.

### How the demo shows it

- The malicious API sometimes returns `200 OK` but junk/partial JSON.
- The naive agent detects the response is unusable and retries—often triggering additional payments.

**Impact:** money is spent without receiving the promised service outcome.

---

## Why this matters to x402 (the missing layer)

**x402 defines how payments are made.  
This demo shows why agents also need rules for when payments must be blocked.**

To make autonomous payments safe in practice, we need deterministic guardrails:

- **Per-payment spend caps** (stop overpricing)
- **Budget caps over time windows** (stop retry drains)
- **Conditional execution / response gating** (don’t pay for junk)

**x402-guard** is designed to enforce these policies with **deterministic decisions** and **human-readable explanations**, making failures auditable and production-ready.


