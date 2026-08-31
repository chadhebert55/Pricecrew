import { Router, type IRouter, type Request } from "express";
import Stripe from "stripe";
import {
  CreateBillingCheckoutBody,
  CreateBillingCheckoutResponse,
  GetBillingResponse,
} from "@workspace/api-zod";
import {
  isPublicProposalPath,
  requireEstimatorAuth,
  requestCompanyId,
} from "../middlewares/estimatorAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

export const BILLING_PLANS = [
  {
    id: "solo" as const,
    name: "Solo",
    amount: 19,
    interval: "month" as const,
    description: "For one-person operations",
  },
  {
    id: "crew" as const,
    name: "Crew",
    amount: 49,
    interval: "month" as const,
    description: "For teams that work together",
  },
];

const PRICE_ID_ENV_BY_PLAN = {
  solo: "STRIPE_SOLO_PRICE_ID",
  crew: "STRIPE_CREW_PRICE_ID",
} as const;

type StripeTestConfig =
  | {
      available: true;
      secretKey: string;
      priceIds: Record<keyof typeof PRICE_ID_ENV_BY_PLAN, string>;
    }
  | {
      available: false;
      message: string;
    };

export function getStripeTestConfig(): StripeTestConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const soloPriceId = process.env.STRIPE_SOLO_PRICE_ID?.trim();
  const crewPriceId = process.env.STRIPE_CREW_PRICE_ID?.trim();

  if (!secretKey || !soloPriceId || !crewPriceId) {
    return {
      available: false,
      message:
        "Stripe test checkout is not configured in this environment. Add a sk_test_ key and test price IDs to enable it.",
    };
  }

  if (!secretKey.startsWith("sk_test_")) {
    return {
      available: false,
      message:
        "Stripe checkout is disabled because only test-mode secret keys are accepted.",
    };
  }

  if (
    !/^price_[A-Za-z0-9]+$/.test(soloPriceId) ||
    !/^price_[A-Za-z0-9]+$/.test(crewPriceId)
  ) {
    return {
      available: false,
      message:
        "Stripe test checkout is not configured with valid test price IDs.",
    };
  }

  return {
    available: true,
    secretKey,
    priceIds: {
      solo: soloPriceId,
      crew: crewPriceId,
    },
  };
}

function appUrlForRequest(req: Request) {
  const configuredUrl = process.env.STRIPE_CHECKOUT_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get("host");
  return host ? `${protocol}://${host}` : null;
}

export function getBillingStatus() {
  const config = getStripeTestConfig();
  return GetBillingResponse.parse({
    mode: config.available ? "test" : "not_configured",
    checkoutAvailable: config.available,
    currentPlan: null,
    plans: BILLING_PLANS,
    message: config.available
      ? "Stripe test checkout is ready. No real charges will be processed."
      : config.message,
  });
}

type TestPrice = {
  id: string;
  livemode: boolean;
  type: string;
  recurring: { interval: string } | null;
};

export async function createStripeTestCheckout(input: {
  plan: keyof typeof PRICE_ID_ENV_BY_PLAN;
  priceId: string;
  appUrl: string;
  retrievePrice: (priceId: string) => Promise<TestPrice>;
  createSession: (
    input: Stripe.Checkout.SessionCreateParams,
  ) => Promise<{ url: string | null }>;
}) {
  const price = await input.retrievePrice(input.priceId);
  if (
    price.livemode ||
    price.type !== "recurring" ||
    price.recurring?.interval !== "month"
  ) {
    return {
      ok: false as const,
      error:
        "Stripe checkout is disabled because the selected price is not a recurring test-mode price.",
    };
  }

  const session = await input.createSession({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${input.appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.appUrl}/billing?checkout=cancelled`,
    metadata: { plan: input.plan },
  });

  if (!session.url) {
    return {
      ok: false as const,
      error: "Stripe did not return a test checkout URL.",
    };
  }

  return { ok: true as const, checkoutUrl: session.url };
}

router.use((req, res, next) => {
  if (isPublicProposalPath(req)) {
    next();
    return;
  }
  void requireEstimatorAuth(req, res, next);
});

router.get("/billing", (_req, res) => {
  res.json(getBillingStatus());
});

router.post("/billing/checkout", async (req, res) => {
  requestCompanyId(req);

  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const config = getStripeTestConfig();
  if (!config.available) {
    res.status(400).json({ error: config.message });
    return;
  }

  const appUrl = appUrlForRequest(req);
  if (!appUrl) {
    res.status(503).json({
      error: "Stripe test checkout is unavailable because the app URL is unknown.",
    });
    return;
  }

  const plan = parsed.data.plan;
  const stripe = new Stripe(config.secretKey);

  try {
    const result = await createStripeTestCheckout({
      plan,
      priceId: config.priceIds[plan],
      appUrl,
      retrievePrice: (priceId) => stripe.prices.retrieve(priceId),
      createSession: (input) => stripe.checkout.sessions.create(input),
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(
      CreateBillingCheckoutResponse.parse({
        checkoutUrl: result.checkoutUrl,
        mode: "test",
      }),
    );
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown Stripe error" },
      "Stripe test checkout could not be created",
    );
    res.status(503).json({
      error:
        "Stripe test checkout is temporarily unavailable. No payment was processed.",
    });
  }
});

export default router;