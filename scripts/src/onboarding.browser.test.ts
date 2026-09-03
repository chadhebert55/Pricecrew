import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  companiesTable,
  companyMembersTable,
  priceBookItemsTable,
  companySettingsTable,
  db,
} from "@workspace/db";

const apiUrl = "http://127.0.0.1:5080";
// Dedicated onboarding harness that renders the real AuthenticatedPrivateRouter
// (fetches company profile from the API, honors onboardingCompleted). The
// 5174 harness bypasses onboarding for other tests.
const onboardingWebUrl = "http://127.0.0.1:5176";

/**
 * Provisions a fresh Clerk user via the test-only header. The
 * `requireEstimatorAuth` middleware creates a matching company row with
 * `onboardingCompleted: false`, so navigating to `/` renders the onboarding
 * wizard. Returns the created `companyId` for cleanup.
 */
async function provisionOnboardingUser(
  userId: string,
  request: {
    get: (
      url: string,
      options: { headers: Record<string, string> },
    ) => Promise<{ ok: () => boolean }>;
  },
): Promise<number> {
  const response = await request.get(`${apiUrl}/api/company`, {
    headers: { "x-test-clerk-user-id": userId },
  });
  expect(response.ok()).toBe(true);

  const [membership] = await db
    .select({ companyId: companyMembersTable.companyId })
    .from(companyMembersTable)
    .where(eq(companyMembersTable.userId, userId));
  expect(membership).toBeTruthy();
  return membership!.companyId;
}

async function cleanupOnboardingUser(
  userId: string,
  companyId: number | undefined,
): Promise<void> {
  if (companyId === undefined) return;
  await db
    .delete(companySettingsTable)
    .where(eq(companySettingsTable.companyId, companyId));
 await db
  .delete(priceBookItemsTable)
  .where(eq(priceBookItemsTable.companyId, companyId));
  await db
    .delete(companyMembersTable)
    .where(eq(companyMembersTable.userId, userId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
}

test("new user landing on / sees the onboarding wizard on step 1", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_step1_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    await expect(
      page.getByRole("heading", { name: "Welcome to PriceCrew" }),
    ).toBeVisible();
    await expect(page.getByTestId("input-company-name")).toBeVisible();
    // Field must NOT be pre-filled with the auto-provisioner's placeholder.
    await expect(page.getByTestId("input-company-name")).toHaveValue("");

    // Step 1 progress: ((1 - 1) / 3) * 100 = 0.
    await expect(page.getByTestId("onboarding-progress")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("empty and placeholder company names are rejected on step 1", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_name_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    // Empty submission
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("error-message")).toHaveText(
      "Company name is required",
    );
    await expect(page.getByTestId("error-message")).toHaveAttribute(
      "role",
      "alert",
    );

    // Placeholder submission (case-insensitive)
    await page.getByTestId("input-company-name").fill("My Company");
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("error-message")).toHaveText(
      "Please enter your real company name",
    );

    // Case-insensitive check
    await page.getByTestId("input-company-name").fill("my company");
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("error-message")).toHaveText(
      "Please enter your real company name",
    );

    // Should still be on step 1
    await expect(
      page.getByRole("heading", { name: "Company Name" }),
    ).toBeVisible();

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("Enter key submits step 1 and advances to step 2", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_enter_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    await page.getByTestId("input-company-name").fill("Test Electric Co");
    await page.getByTestId("input-company-name").press("Enter");

    await expect(
      page.getByRole("heading", { name: "Primary Trade" }),
    ).toBeVisible();

    // Step 2 progress: ((2 - 1) / 3) * 100 ≈ 33.3. Radix rounds; allow 30-40.
    const progressValue = await page
      .getByTestId("onboarding-progress")
      .getAttribute("aria-valuenow");
    expect(Number(progressValue)).toBeGreaterThanOrEqual(30);
    expect(Number(progressValue)).toBeLessThan(40);

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("trade selection is required to advance from step 2", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_trade_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    await page.getByTestId("input-company-name").fill("Trade Test Co");
    await page.getByTestId("btn-next").click();
    await expect(
      page.getByRole("heading", { name: "Primary Trade" }),
    ).toBeVisible();

    // Try to advance without picking a trade
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("error-message")).toHaveText(
      "Please select a primary trade",
    );

    // Pick one, error clears
    await page.getByTestId("trade-option-Electrical").click();
    await expect(page.getByTestId("error-message")).toHaveCount(0);

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("full happy path: Electrical + Import CSV lands on /price-book", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_happy_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    // Step 1
    await page.getByTestId("input-company-name").fill("Hebert Electric LLC");
    await page.getByTestId("btn-next").click();

    // Step 2
    await expect(
      page.getByRole("heading", { name: "Primary Trade" }),
    ).toBeVisible();
    await page.getByTestId("trade-option-Electrical").click();
    await expect(page.getByText("Electrical templates included")).toBeVisible();
    await page.getByTestId("btn-next").click();

    // Step 3 — progress must be < 100 before Finish
    await expect(page.getByRole("heading", { name: "Price Book" })).toBeVisible();
    const progressValue = await page
      .getByTestId("onboarding-progress")
      .getAttribute("aria-valuenow");
    expect(Number(progressValue)).toBeLessThan(100);
    expect(Number(progressValue)).toBeGreaterThanOrEqual(60);

    await page.getByTestId("pricebook-option-import").click();
    await expect(page.getByTestId("btn-finish")).toHaveText(
      "Finish & Import CSV",
    );
    await page.getByTestId("btn-finish").click();

    // Landing route for Import path
    await expect(page).toHaveURL(`${onboardingWebUrl}/price-book`);

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("Skip path lands on the dashboard with correct finish label", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_skip_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    await page.getByTestId("input-company-name").fill("Chad's Test Co");
    await page.getByTestId("btn-next").click();
    await page.getByTestId("trade-option-Electrical").click();
    await page.getByTestId("btn-next").click();
    await page.getByTestId("pricebook-option-skip").click();
    await expect(page.getByTestId("btn-finish")).toHaveText(
      "Finish & Go to Dashboard",
    );
    await page.getByTestId("btn-finish").click();

    await expect(page).toHaveURL(`${onboardingWebUrl}/`);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("non-electrical trade shows blank-workspace notice and completes", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_plumbing_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    await page.getByTestId("input-company-name").fill("Test Plumbing");
    await page.getByTestId("btn-next").click();

    await page.getByTestId("trade-option-Plumbing").click();
    await expect(page.getByText("Blank workspace")).toBeVisible();
    await expect(
      page.getByText(/start from the Builders page/i),
    ).toBeVisible();

    await page.getByTestId("btn-next").click();
    await page.getByTestId("pricebook-option-empty").click();
    await page.getByTestId("btn-finish").click();

    // Plumbing lands on the dashboard just like Electrical.
    await expect(page).toHaveURL(`${onboardingWebUrl}/`);

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});

test("Back button on step 2 preserves company name from step 1", async ({
  browser,
  request,
}) => {
  const userId = `onboarding_back_${randomUUID()}`;
  let companyId: number | undefined;

  try {
    companyId = await provisionOnboardingUser(userId, request);

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();
    await page.goto(`${onboardingWebUrl}/`);

    await page.getByTestId("input-company-name").fill("Round Trip Electric");
    await page.getByTestId("btn-next").click();
    await expect(
      page.getByRole("heading", { name: "Primary Trade" }),
    ).toBeVisible();

    await page.getByTestId("btn-back").click();
    await expect(
      page.getByRole("heading", { name: "Company Name" }),
    ).toBeVisible();
    await expect(page.getByTestId("input-company-name")).toHaveValue(
      "Round Trip Electric",
    );

    await context.close();
  } finally {
    await cleanupOnboardingUser(userId, companyId);
  }
});
