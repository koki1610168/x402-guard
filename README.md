# x402-Guard

Security guardrails for autonomous payments on top of the **x402** payment protocol.

**x402 defines how payments are made. x402-Guard defines when payments should be blocked.**  
This repo adds a deterministic policy + safety layer **without modifying x402**.

## Why this exists

Autonomous agents can make programmatic payments without human oversight. That’s powerful, but it creates new failure modes that look like “normal bugs” and quickly become **irreversible financial loss**:

- Infinite retry drains (paying repeatedly while retrying failures)
- Malicious or accidental overpricing (valid responses, unreasonable price)
- Paying for junk/partial service responses

x402-Guard is a lightweight “seatbelt” that makes these failure modes **explicit, testable, and auditable**.

## Security guarantees (invariants)

x402-Guard enforces three core invariants:

- **Per-payment spend cap**: no single payment can exceed a configured maximum
- **Budget cap within a time window**: total spend over a session/window is bounded
- **Conditional payment execution**: payments only finalize if the service response satisfies explicit conditions (status/shape/latency/etc.)

When a payment is blocked, the guard returns a **machine-readable reason code** plus a **human-readable explanation** suitable for logs, dashboards, or demos.

## Non-goals

- Replacing or changing the x402 protocol (x402-Guard is strictly a layer *above* x402)
- Hiding policy decisions inside opaque heuristics (decisions must be deterministic and explainable)
- Being “the” agent framework (this should wrap any agent code that can call an x402 client)

## Project status

**Current status: scaffold / early prototype.**

- **Implemented today**: repo scaffolding + design doc (`docs/DESIGN.md`)
- **Planned next**: `X402Guard` SDK, policy engine, receipts/denials, demo harness, and tests (see Roadmap)

If you’re a hackathon judge or reviewer, start with the design doc:
- `docs/DESIGN.md`

## Install

```bash
pnpm install
```

## Demo (threat models)

This repo includes a deliberately adversarial x402 resource server plus a naive agent to reproduce common autonomous-payment failures.

### 1) Configure env

Create a local `.env` in the repo root using:

- `demo/env.example`

### 2) Run the malicious API (resource server)

```bash
pnpm demo:api
```

### 3) Run the naive agent (client)

```bash
pnpm demo:naive
```

What you should see:

- The server offers **two payment options**, with the **expensive option first**
- The naive agent **picks the first**, pays, and then **retries** when responses are junk/partial
- Logs show repeated payments (retry drain) and overpaying (overpricing)

## Quickstart (current)

This is a placeholder entrypoint while we build the SDK:

```bash
pnpm dev
```

## Design principles (what “production-grade” means here)

- **Deterministic enforcement**: same inputs → same decision
- **Fail-closed by default**: if policy can’t be evaluated safely, do not pay
- **Auditable decisions**: every allow/deny emits structured context (receipts / denial records)
- **Protocol isolation**: x402 integration is behind a thin adapter so guard logic stays testable

## Proposed SDK (API sketch)

This is the target developer experience; implementation will land in `src/` per `docs/DESIGN.md`.

```ts
import { X402Guard } from "x402-guard";

const guard = new X402Guard({
  policy: {
    maxPerPayment: 0.50,                 // USD (example)
    budget: { limit: 5.00, windowMs: 60_000 },
    conditions: {
      requireHttp2xx: true,
      maxLatencyMs: 2_000,
      requiredJsonFields: ["result"],
    },
  },
});

const res = await guard.fetch("https://api.example.com/compute", {
  method: "POST",
  body: JSON.stringify({ prompt: "..." }),
});

// If blocked, the error includes a reason code + human-readable explanation.
```

## Threat model (what we defend against)

x402-Guard focuses on three common autonomous-payment failures:

- **Infinite retry drain**: repeated attempts keep paying (or keep authorizing) while failing
- **Overpricing**: services charge above reasonable limits or above an agreed cap
- **Fake/partial service**: responses are junk, truncated, malformed, or violate required structure

## Roadmap

- **Core SDK**: `src/guard.ts` orchestration + public exports in `src/index.ts`
- **Policy**: explicit policy types + validation (`src/policy/*`)
- **Budget accounting**: spend windows + retry-aware draining prevention
- **Conditional execution**: response-gated finalize (status/shape/latency/size)
- **Receipts & denials**: structured audit records with reason codes + explanations
- **Demos**: naive vs guarded agent + malicious API harness
- **Tests**: focused unit tests for policy/budget/guard decisions
- **Docs**: architecture + threat model (expanded beyond `DESIGN.md`)

## Security notes

This repository is intended to reduce accidental loss from autonomous payment flows, but it is **not a substitute for**:

- key management best practices
- runtime sandboxing for agents
- merchant allowlists / trust frameworks
- monitoring and alerting

If you find a security issue, please open a private disclosure (or open an issue if the impact is non-sensitive).

## Contributing

Contributions are welcome. If you’re adding new policy surfaces, please:

- keep rules deterministic and explainable
- include reason codes + a human-readable explanation
- add a minimal test that demonstrates the failure mode being prevented

## License

MIT (see `LICENSE`).
