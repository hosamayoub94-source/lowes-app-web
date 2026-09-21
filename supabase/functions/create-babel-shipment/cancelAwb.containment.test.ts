// PHASE 0 — cancelAwb containment tests (see PHASE_0_CANCELAWB_REPORT.md).
// Run with: deno test --allow-env supabase/functions/create-babel-shipment/cancelAwb.containment.test.ts
//
// These tests NEVER let a real network call reach Babel's API. `globalThis.fetch`
// is replaced with a stub that THROWS if invoked — any test that unexpectedly
// reaches the carrier fails loudly instead of silently sending a real request.
// No shipment, no order, no DB row, and no real credential is touched by this file.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handler } from "./index.ts";

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/create-babel-shipment", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function withNoNetwork<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("TEST FAILURE: a real network call was attempted (carrier API or otherwise) — containment gate did not fail closed before reaching fetch()");
  }) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const original: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) original[k] = Deno.env.get(k);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

// Babel creds must be present for the request to get past the earlier
// `secrets_missing` short-circuit and actually reach the cancelAwb branch.
const BASE_ENV = { BABEL_API_USER: "test-user", BABEL_API_PASS: "test-pass" };

Deno.test("cancelAwb: unauthorized call (no X-Internal-Key header) → denied, zero network calls", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: "correct-secret" }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({ cancelAwb: "422444626" }));
      assertEquals(res.status, 401);
      const j = await res.json();
      assertEquals(j.ok, false);
      assertEquals(j.error, "unauthorized");
    });
  });
});

Deno.test("cancelAwb: wrong X-Internal-Key value → denied, zero network calls", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: "correct-secret" }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({ cancelAwb: "422444626" }, { "X-Internal-Key": "guessed-wrong-value" }));
      assertEquals(res.status, 401);
    });
  });
});

Deno.test("cancelAwb: secret not provisioned at all (current production reality) → always denied even with a plausible-looking key", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: undefined }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({ cancelAwb: "422444626" }, { "X-Internal-Key": "anything-at-all" }));
      assertEquals(res.status, 401);
    });
  });
});

Deno.test("cancelAwb: direct invocation with only cancelAwb in body (no orderId) → still denied, not treated as a different code path", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: "correct-secret" }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({ cancelAwb: "SOME-RANDOM-GUESSED-AWB" }));
      assertEquals(res.status, 401);
    });
  });
});

Deno.test("cancelAwb: attempted role/identity spoofing in body does not bypass the key check", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: "correct-secret" }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({
        cancelAwb: "422444626",
        userRole: "admin",
        requesterRole: "admin",
        isManager: true,
      }));
      assertEquals(res.status, 401);
    });
  });
});

Deno.test("cancelAwb: malformed JSON body does not crash the function and does not reach the carrier", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: "correct-secret" }, async () => {
    await withNoNetwork(async () => {
      const badReq = new Request("https://example.test/create-babel-shipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ this is not valid json",
      });
      const res = await handler(badReq);
      // The function's own try/catch must turn this into a handled 500, not an
      // unhandled exception that could crash the isolate or leak a stack trace
      // in an unexpected shape.
      assertEquals(res.status, 500);
      const j = await res.json();
      assertEquals(j.ok, false);
    });
  });
});

Deno.test("cancelAwb: CORRECT internal key IS accepted (proves the gate is not fail-closed forever, only until the secret is provisioned) — network call is reached but immediately fails safely because no real Babel creds/response are mocked beyond BASE_ENV", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: "correct-secret" }, async () => {
    const original = globalThis.fetch;
    let fetchCalledWith: string | undefined;
    globalThis.fetch = ((url: string) => {
      fetchCalledWith = String(url);
      // Return a well-formed but clearly-fake failure response — this proves
      // the gate let the request through to `babel()`, WITHOUT ever letting a
      // real request reach babel-express.com (we intercept before that).
      return Promise.resolve(new Response(JSON.stringify({ status: "error", errorMessage: "TEST STUB — not a real carrier response" }), { status: 200 }));
    }) as typeof fetch;
    try {
      const res = await handler(req({ cancelAwb: "422444626" }, { "X-Internal-Key": "correct-secret" }));
      assertEquals(res.status, 200);
      assertNotEquals(fetchCalledWith, undefined);
      // Confirms the ONLY network call made was intercepted by our stub, never
      // reaching the real babel-express.com host.
      assertEquals(fetchCalledWith?.includes("babel-express.com"), true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

Deno.test("regression: debug:true still short-circuits before the containment gate (unaffected by this change)", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: undefined }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({ debug: true }));
      assertEquals(res.status, 200);
      const j = await res.json();
      assertEquals(j.ok, true);
      assertEquals(j.debug, true);
    });
  });
});

Deno.test("regression: missing orderId (non-cancelAwb, non-debug path) still returns its original 400 — containment gate did not leak into other branches", async () => {
  await withEnv({ ...BASE_ENV, LOWES_BABEL_CANCEL_INTERNAL_KEY: undefined }, async () => {
    await withNoNetwork(async () => {
      const res = await handler(req({}));
      assertEquals(res.status, 400);
      const j = await res.json();
      assertEquals(j.error, "orderId required");
    });
  });
});
