# x402-Guard

**Security guardrails for autonomous payments on top of the x402 payment protocol.**

**x402 defines how payments are made. x402-Guard defines when payments should be blocked.**  
This repo adds a deterministic policy + safety layer **without modifying x402**.

## Why this exists

Autonomous agents can make programmatic payments without human oversight. That creates failure modes that look like “normal bugs” but can cause **rapid, irreversible financial loss**:

- **Infinite retry drain**: agents retry failing calls and pay every attempt
- **Malicious/accidental overpricing**: services offer valid options but steer clients into expensive choices
- **Paying for junk/partial service**: responses are unusable after payment, triggering more paid retries

x402-Guard makes these risks **explicit, testable, and auditable**.

## Security guarantees (invariants)

x402-Guard enforces three invariants:

- **Per-payment spend cap**: no single payment exceeds a configured maximum
- **Budget cap within a time window**: total spend over a rolling window is bounded
- **Response conditions**: responses must satisfy explicit conditions (status/latency/schema) to avoid retry-drain

When blocked, the guard throws a `GuardError` with:

- a **machine-readable** `code`
- a **human-readable** `explanation`
- optional `details` for debugging/audit

It can also emit structured **decision records** (`allow` / `deny`) via `onDecision(...)`.

## What’s in this repo

- **SDK**: `src/` (`X402Guard`, policy helpers, decision records)
- **Demo harness**: `demo/` (malicious resource server + naive/guarded agents)
- **Tests**: `test/` (cap/selection, budget window, response conditions)

## Install

```bash
pnpm install
```

## Quickstart (demo)

See `demo/README.md` for the threat model explanation.

### 1) Configure env

Create `.env` in the repo root based on:

- `env.example`

### 2) Start the malicious x402 resource server

```bash
pnpm demo:api
```

Deterministic controls (via `.env` or query param):

- `MALICIOUS_MODE=random|good|junk|partial|error`
- `MALICIOUS_SEED=...` (reproducible randomness)
- `MALICIOUS_LOG_MODE=1` (log chosen mode)
- `POST /v1/compute?mode=junk` (force per-request mode)


### 3) Run the naive agent (unsafe)

```bash
pnpm demo:naive
```

Expected behavior:

- picks the first payment option
- pays repeatedly on retries
- demonstrates overpricing + retry drain

### 4) Run the guarded agent (protected)

```bash
pnpm demo:guarded
```

Expected behavior:

- filters/avoids expensive payment options (cap + cheapest selection)
- enforces a rolling budget window (blocks **before** signing new payments)
- blocks/flags junk/partial responses (conditions) to stop paid retry loops
- prints structured decision records (audit output)

## SDK usage

x402-Guard wraps an `x402Client` and `fetch`. You keep full control of x402 schemes/signers.

```ts
import { X402Guard, GuardError } from "x402-guard";
import { x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(account));

const guard = new X402Guard(fetch, {
  client,
  policy: {
    // Pre-payment controls
    maxPerPaymentUsd: 0.10,
    budget: { limitUsd: 1.0, windowMs: 60_000 },
    selectCheapest: true,

    // Post-response controls (prevents retry-drain / junk acceptance)
    conditions: {
      requireHttp2xx: true,
      maxLatencyMs: 2_000,
      requiredJsonFields: ["result"],
    },
  },
  onDecision: (record) => {
    // Send to logs/metrics/audit store
    console.log(JSON.stringify(record));
  },
});

try {
  const res = await guard.fetch("https://example.com/v1/compute", { method: "POST" });
  console.log(await res.json());
} catch (e) {
  if (e instanceof GuardError) {
    console.error(e.code, e.explanation, e.details);
  } else {
    throw e;
  }
}
```

## Design principles

- **Deterministic enforcement**: same inputs → same decision
- **Fail-closed defaults**: if policy evaluation fails, do not pay
- **Auditability**: structured decision records + stable reason codes
- **Protocol isolation**: x402 remains the payment protocol; guard remains the policy layer

## Important limitations (honest security model)

- In typical **pay-to-access** flows, a client may need to pay before receiving the protected body.  
  Guardrails therefore focus on:
  - blocking obviously bad payments **before signing** (caps/budgets/selection)
  - preventing **repeat loss** via retries (response conditions)

## Tests

```bash
pnpm test
```

## License

MIT (see `LICENSE`).
