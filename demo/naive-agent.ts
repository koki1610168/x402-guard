import { config as loadEnv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

loadEnv();

const API_URL = process.env.API_URL ?? "http://localhost:3000/v1/compute";
const NETWORK = process.env.X402_NETWORK ?? "eip155:84532";
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;

const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS ?? 25);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS ?? 100);

if (!EVM_PRIVATE_KEY) {
  throw new Error("Missing EVM_PRIVATE_KEY. Put it in .env (see demo/env.example).");
}
const EVM_PRIVATE_KEY_NON_NULL = EVM_PRIVATE_KEY;

function formatUsdcFromBaseUnits(value: bigint): string {
  const dollars = Number(value) / 1_000_000;
  return `$${dollars.toFixed(6)}`;
}

function tryParseUsdcBaseUnitsFromRequirements(req: any): bigint | null {
  // x402 v2 PaymentRequirements shape includes { asset, amount } (amount is string base units).
  if (req && typeof req.amount === "string") {
    try {
      return BigInt(req.amount);
    } catch {
      return null;
    }
  }
  // Older / alternate shapes may have `value`.
  if (req && typeof req.value === "string") {
    try {
      return BigInt(req.value);
    } catch {
      return null;
    }
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const account = privateKeyToAccount(EVM_PRIVATE_KEY_NON_NULL);

  let totalValueBaseUnits = 0n;
  let paymentsAttempted = 0;

  /**
   * Naive behavior by design:
   * - no budget caps
   * - no per-request max
   * - no response validation gate before “accepting” the result
   * - retries aggressively on any unexpected response shape or error
   */
  const client = new x402Client()
    // Support all EVM networks (x402 v2 CAIP-2 ids like eip155:84532)
    .register("eip155:*", new ExactEvmScheme(account))
    // Also register the specific network for clarity when reading logs.
    .register(NETWORK as any, new ExactEvmScheme(account))
    .onBeforePaymentCreation(async ({ selectedRequirements }) => {
      paymentsAttempted += 1;
      const value = tryParseUsdcBaseUnitsFromRequirements(selectedRequirements as any);
      if (value !== null) {
        totalValueBaseUnits += value;
        // eslint-disable-next-line no-console
        console.log(
          `[naive-agent] payment #${paymentsAttempted}: scheme=${selectedRequirements.scheme} network=${selectedRequirements.network} amount=${value.toString()} (~${formatUsdcFromBaseUnits(value)}) payTo=${selectedRequirements.payTo}`,
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[naive-agent] payment #${paymentsAttempted}: scheme=${selectedRequirements.scheme} network=${selectedRequirements.network} (could not parse amount) payTo=${selectedRequirements.payTo}`,
      );
    });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-console
    console.log(`\n[naive-agent] attempt ${attempt}/${MAX_ATTEMPTS} → ${API_URL}`);

    try {
      const res = await fetchWithPayment(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "compute something expensive" }),
      });

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.log(`[naive-agent] non-2xx: ${res.status} body=${JSON.stringify(body)}`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // Naive “schema check”: if it doesn’t look right, retry.
      const result = (body as any)?.result;
      if (typeof result !== "string") {
        // eslint-disable-next-line no-console
        console.log(`[naive-agent] bad response shape; retrying. body=${JSON.stringify(body)}`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // eslint-disable-next-line no-console
      console.log(`[naive-agent] success: result=${result}`);
      break;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[naive-agent] request error; retrying. err=${String(err)}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n[naive-agent] done. paymentsAttempted=${paymentsAttempted} estimatedTotal=${formatUsdcFromBaseUnits(totalValueBaseUnits)} (baseUnits=${totalValueBaseUnits.toString()})`,
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});


