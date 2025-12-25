## Threat Model

This document describes the security goals and threat model for **x402-Guard**: a policy layer that protects autonomous agents from unintended loss when making payments via the x402 protocol.

**Key layering principle**

- **x402** defines *how* payment is negotiated/signed/settled.
- **x402-Guard** defines *when* a payment should be blocked (explicit, deterministic policy).

---

## Security goals

x402-Guard is designed to enforce three invariants:

- **Per-payment spend cap**: no single payment exceeds a configured maximum.
- **Budget cap within a rolling time window**: total spend in a window is bounded.
- **Response conditions**: responses must satisfy explicit conditions (status/latency/schema) to avoid retry-drain and junk acceptance.

When an invariant would be violated, x402-Guard must:

- **Fail closed** (do not sign / do not pay).
- Return a **machine-readable reason code** and a **human-readable explanation**.
- Emit structured **audit records** (allow/deny) suitable for logging and review.

---

## Assets (what we protect)

- **Agent funds**: the primary asset; loss is often irreversible.
- **Budget & policy intent**: the user’s explicit constraints (caps, budgets, conditions).
- **Audit integrity**: the ability to explain *why* a payment was allowed/denied.

Non-assets / out of scope (see below): private keys and runtime integrity.

---

## Actors & trust boundaries

### Client-side (agent environment)

- **Autonomous agent**: code that decides when to call paid endpoints.
- **x402 client**: creates payment headers/payloads for acceptable requirements.
- **x402-Guard**: policy layer that constrains what the agent is allowed to pay for.

Assumption: x402-Guard runs inside the agent process (same trust boundary).

### Server-side (external)

- **Resource server**: publishes payment requirements and returns responses after payment.
- **Facilitator**: verifies/settles payments (protocol-specific).

Assumption: resource server may be honest, buggy, flaky, or actively malicious.

---

## Threats (what we defend against)

These are the primary real-world failure modes for autonomous payments, mapped to the demo in `demo/README.md`.

### T1 — Infinite retry drain

**Scenario:** An agent retries failing requests (timeouts/5xx/schema errors). Each retry triggers a new payment attempt, draining funds.

**Mitigations:**

- **Rolling budget window** blocks spend before signing the next payment payload.
- **Response conditions** stop “pay + junk + retry + pay” loops by failing fast after junk/partial responses.

### T2 — Malicious/accidental overpricing

**Scenario:** A server advertises multiple valid payment options and places an expensive option first, relying on default selection behavior.

**Mitigations:**

- **Per-payment cap** filters out requirements above the configured maximum *before signing*.
- **Cheapest selection** sorts acceptable requirements cheapest-first to avoid expensive default selection.

### T3 — Fake or partial service response

**Scenario:** A server accepts payment but returns junk, malformed JSON, missing fields, or incomplete output.

**Mitigations:**

- **Response conditions** (status/latency/schema) prevent accepting invalid results and reduce paid retries.

---

## What x402-Guard cannot prevent (important limitations)

### Pay-to-access limitation (first payment)

In typical x402 pay-to-access flows, the client may need to pay before receiving the protected body.  
Therefore:

- x402-Guard can prevent **obviously bad payments** *before signing* (caps/budgets/selection),
- but it cannot guarantee you’ll never pay once to discover a service is low quality, unless the server supports previews/unpaid responses.

### In-memory budget accounting (current)

The current rolling budget in this repo is in-memory and single-process (demo-grade).  
Production hardening would require:

- persistence/replication across processes
- idempotency keys to avoid double-counting retries
- concurrency-safe per-request decision context

### Asset/decimals semantics (current)

Policy conversions currently assume USDC-like semantics (6 decimals) when interpreting `amount` base units.  
Production versions should be asset-aware and avoid assuming USD equivalence for arbitrary assets.

---

## Out of scope (explicit non-goals)

- **Key management** (HSMs, MPC, wallet compromise) — if attacker controls keys, they can bypass client policy.
- **Agent runtime integrity** (RCE/sandbox escapes) — requires system-level hardening.
- **Merchant reputation / allowlists** — can be added as a policy surface, but not required for the core invariants.
- **Facilitator correctness** — assumed as part of the underlying x402 trust model.


