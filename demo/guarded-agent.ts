import { config as loadEnv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

import { x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

import { GuardError, X402Guard } from "../src/index.js";

loadEnv();

const API_URL = process.env.API_URL ?? "http://localhost:3000/v1/compute";
const NETWORK = process.env.X402_NETWORK ?? "eip155:84532";
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;

if (!EVM_PRIVATE_KEY) {
  throw new Error("Missing EVM_PRIVATE_KEY. Put it in .env (see demo/env.example).");
}
const EVM_PRIVATE_KEY_NON_NULL = EVM_PRIVATE_KEY;

async function main() {
  const account = privateKeyToAccount(EVM_PRIVATE_KEY_NON_NULL);

  const client = new x402Client()
    .register("eip155:*", new ExactEvmScheme(account))
    .register(NETWORK as any, new ExactEvmScheme(account));

  const guard = new X402Guard(fetch, {
    client,
    policy: {
      // For demo: ensure we never pick the expensive “first option” if it’s above this cap.
      maxPerPaymentUsd: 0.0001,

      // For demo: if the API keeps returning junk and we keep retrying, stop after tiny spend.
      budget: { limitUsd: 0.25, windowMs: 60_000 },

      // For demo: reject non-2xx and require the JSON to have `result`.
      conditions: { requireHttp2xx: true, requiredJsonFields: ["result"], maxLatencyMs: 2_000 },

      // Prefer cheapest among remaining acceptable requirements.
      selectCheapest: true,
    },
    onDecision: (record) => {
      // eslint-disable-next-line no-console
      console.log(`[guarded-agent] decision=${record.decision} record=${JSON.stringify(record, null, 2)}`);
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[guarded-agent] calling ${API_URL}`);

  try {
    const res = await guard.fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "compute something expensive" }),
    });

    const body = await res.json().catch(() => null);
    // eslint-disable-next-line no-console
    console.log(`[guarded-agent] success: status=${res.status} body=${JSON.stringify(body)}`);
  } catch (e: any) {
    if (e instanceof GuardError) {
      // eslint-disable-next-line no-console
      console.log(`[guarded-agent] BLOCKED: code=${e.code} explanation=${e.explanation}`);
      // eslint-disable-next-line no-console
      if (e.details) console.log(`[guarded-agent] details=${JSON.stringify(e.details)}`);
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});


