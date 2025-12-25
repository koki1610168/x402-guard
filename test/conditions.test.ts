import { describe, expect, test } from "vitest";
import { enforceResponseConditions } from "../src/policy/conditions.js";

describe("enforceResponseConditions", () => {
  test("rejects non-2xx when requireHttp2xx is set", async () => {
    const res = new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    await expect(
      enforceResponseConditions(res, Date.now(), { requireHttp2xx: true }),
    ).rejects.toMatchObject({ code: "RESPONSE_CONDITION_FAILED" });
  });

  test("rejects missing required field", async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(
      enforceResponseConditions(res, Date.now(), { requiredJsonFields: ["result"] }),
    ).rejects.toMatchObject({ code: "RESPONSE_CONDITION_FAILED" });
  });

  test("rejects null required field (treated as missing)", async () => {
    const res = new Response(JSON.stringify({ ok: true, result: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(
      enforceResponseConditions(res, Date.now(), { requiredJsonFields: ["result"] }),
    ).rejects.toMatchObject({ code: "RESPONSE_CONDITION_FAILED" });
  });
});


