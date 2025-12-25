## Architecture

x402-Guard is a **policy enforcement layer** for autonomous payments made via the x402 protocol.

Core separation:

- **x402** defines **how** payments are negotiated/signed/settled (protocol + SDKs).
- **x402-Guard** defines **when** a payment should be blocked (explicit, deterministic policy).

This keeps the protocol simple while making real-world autonomous payment flows safe.

---

## High-level data flow

1. Agent makes an HTTP request using guarded fetch (`X402Guard.fetch(...)`).
2. Resource server replies with `402 Payment Required` and an `accepts` list (x402).
3. x402-Guard applies **pre-payment policies** to `accepts`:
   - reject overpriced requirements (per-payment cap)
   - optionally sort cheapest-first
4. Before signing a payment payload, x402-Guard enforces **budget window** (retry-drain prevention).
   - if over budget, it **aborts** (no signature → no payment header)
5. If allowed, x402 creates the payment payload and retries the request with payment headers.
6. After a response is received, x402-Guard enforces **response conditions**:
   - status (2xx)
   - latency
   - required JSON fields (missing/null fails)
7. x402-Guard emits a structured **decision record** (`allow`/`deny`) for audit logs / demos.

---

## Enforcement points (critical security model)

### Pre-payment (strongest guarantees)

These checks happen **before** a payment payload is signed:

- **Per-payment cap**: filters out payment requirements above `maxPerPaymentUsd`
- **Cheapest selection**: sorts acceptable requirements by `amount` (base units) so default selection doesn’t overpay
- **Rolling budget window**: blocks spending above the configured `budget` limit inside `windowMs`

If pre-payment checks fail, x402-Guard fails closed:

- it prevents signing
- it prevents sending a payment header
- it emits a denial decision record

### Post-response (pay-to-access limitation)

In typical **pay-to-access** flows, a client may have to pay before receiving the protected body.

Response conditions therefore cannot always prevent the **first** payment to a malicious or low-quality service.
They are primarily used to:

- prevent **retry-drain** (paying repeatedly on junk/partial responses)
- prevent silently accepting invalid responses

---

## Repository mapping (current)

### SDK (`src/`)

- `src/index.ts`: public exports
- `src/guard.ts`: `X402Guard` orchestration; wires x402 client policies/hooks + response conditions
- `src/policy/policy.ts`: policy types + unit conversions and parsing helpers
- `src/policy/requirements.ts`: pure evaluator for “accepts” filtering + cheapest sorting (testable)
- `src/policy/budget.ts`: rolling-window budget accounting (demo-grade in-memory)
- `src/policy/conditions.ts`: post-response checks (status/latency/schema)
- `src/receipt.ts`: structured allow/deny decision record type
- `src/utils/errors.ts`: `GuardError` with stable reason codes + explanations

### Demo (`demo/`)

- `demo/malicious-api.ts`: x402 resource server that models threats (overpricing + fake/partial responses)
- `demo/naive-agent.ts`: unsafe client that pays + retries (reproduces drain)
- `demo/guarded-agent.ts`: guarded client that blocks via policy + prints decision records
- `demo/README.md`: threat model explanation for judges

### Tests (`test/`)

- requirement selection/caps: `test/requirements.test.ts`
- budget window: `test/budget.test.ts`
- response conditions: `test/conditions.test.ts`

---

## Production notes (what we’d harden next)

- **Budget state**: persist/replicate budget counters (not in-memory) for multi-process agents
- **Idempotency**: prevent double-spend across retries with request IDs / idempotency keys
- **Concurrency**: attach per-request decision context explicitly (avoid shared mutable context)
- **Asset semantics**: today policies assume USDC-like 6 decimals; production should be asset-aware


