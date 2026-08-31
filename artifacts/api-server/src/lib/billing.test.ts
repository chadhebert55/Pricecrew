import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";
import app from "../app";
import {
  BILLING_PLANS,
  createStripeTestCheckout,
  getBillingStatus,
  getStripeTestConfig,
} from "../routes/billing";

const stripeEnvKeys = [
  "STRIPE_SECRET_KEY",
  "STRIPE_SOLO_PRICE_ID",
  "STRIPE_CREW_PRICE_ID",
] as const;

function withStripeEnv(
  values: Partial<Record<(typeof stripeEnvKeys)[number], string>>,
  run: () => void,
) {
  const previous = Object.fromEntries(
    stripeEnvKeys.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of stripeEnvKeys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    run();
  } finally {
    for (const key of stripeEnvKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("billing advertises the supplied PriceCrew plans", () => {
  assert.deepEqual(
    BILLING_PLANS.map(({ id, name, amount, interval }) => ({
      id,
      name,
      amount,
      interval,
    })),
    [
      { id: "solo", name: "Solo", amount: 19, interval: "month" },
      { id: "crew", name: "Crew", amount: 49, interval: "month" },
    ],
  );
});

test("billing stays in setup-needed mode without Stripe configuration", () => {
  withStripeEnv({}, () => {
    assert.equal(getStripeTestConfig().available, false);
    assert.deepEqual(getBillingStatus(), {
      mode: "not_configured",
      checkoutAvailable: false,
      currentPlan: null,
      plans: BILLING_PLANS,
      message:
        "Stripe test checkout is not configured in this environment. Add a sk_test_ key and test price IDs to enable it.",
    });
  });
});

test("billing rejects live Stripe secrets", () => {
  withStripeEnv(
    {
      STRIPE_SECRET_KEY: "sk_live_not_allowed",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_CREW_PRICE_ID: "price_crew",
    },
    () => {
      const config = getStripeTestConfig();
      assert.equal(config.available, false);
      if (!config.available) assert.match(config.message, /test-mode/i);
    },
  );
});

test("billing accepts only complete test configuration", () => {
  withStripeEnv(
    {
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_CREW_PRICE_ID: "price_crew",
    },
    () => {
      const config = getStripeTestConfig();
      assert.equal(config.available, true);
      if (config.available) {
        assert.equal(config.priceIds.solo, "price_solo");
        assert.equal(config.priceIds.crew, "price_crew");
      }
    },
  );
});

test("test checkout helper creates only a recurring test-mode session", async () => {
  let sessionInput: unknown;
  const result = await createStripeTestCheckout({
    plan: "solo",
    priceId: "price_solo",
    appUrl: "https://example.test",
    retrievePrice: async (id) => ({
      id,
      livemode: false,
      type: "recurring",
      recurring: { interval: "month" },
    }),
    createSession: async (input) => {
      sessionInput = input;
      return { url: "https://checkout.stripe.test/session" };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    checkoutUrl: "https://checkout.stripe.test/session",
  });
  assert.deepEqual(sessionInput, {
    mode: "subscription",
    line_items: [{ price: "price_solo", quantity: 1 }],
    success_url:
      "https://example.test/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://example.test/billing?checkout=cancelled",
    metadata: { plan: "solo" },
  });
});

test("test checkout helper rejects live prices before session creation", async () => {
  let sessionCreated = false;
  const result = await createStripeTestCheckout({
    plan: "crew",
    priceId: "price_crew",
    appUrl: "https://example.test",
    retrievePrice: async (id) => ({
      id,
      livemode: true,
      type: "recurring",
      recurring: { interval: "month" },
    }),
    createSession: async () => {
      sessionCreated = true;
      return { url: "https://checkout.stripe.test/session" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(sessionCreated, false);
});

test("billing API requires authentication", async () => {
  const server = await new Promise<Server>((resolve) => {
    const candidate = app.listen(0, () => resolve(candidate));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not open a TCP port");
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/api/billing`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Authentication required" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});