import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  companiesTable,
  companyMembersTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
  type AdditionInputRecord,
} from "@workspace/db";

const apiUrl = "http://127.0.0.1:5080";
const anonymousWebUrl = "http://127.0.0.1:5175";
const authenticatedWebUrl = "http://127.0.0.1:5174";

const landingHeading = "Private estimating for your contracting company.";

test("unauthenticated dashboard entry points stay on the public landing page", async ({
  page,
}) => {
  await page.goto(`${anonymousWebUrl}/`);
  await expect(page).toHaveURL(`${anonymousWebUrl}/`);
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto(`${anonymousWebUrl}/dashboard`);
  await expect(page).toHaveURL(`${anonymousWebUrl}/dashboard`);
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("authenticated dashboard bookmarks redirect, survive reload, and keep new quotes available", async ({
  browser,
  request,
}) => {
  const marker = randomUUID();
  const userId = `dashboard_routes_ui_${marker}`;
  let companyId: number | undefined;

  try {
    const settingsResponse = await request.get(`${apiUrl}/api/settings`, {
      headers: { "x-test-clerk-user-id": userId },
    });
    expect(settingsResponse.ok()).toBe(true);

    const [membership] = await db
      .select({ companyId: companyMembersTable.companyId })
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));
    expect(membership).toBeTruthy();
    companyId = membership!.companyId;

    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const page = await context.newPage();

    await page.goto(`${authenticatedWebUrl}/dashboard`);
    await expect(page).toHaveURL(`${authenticatedWebUrl}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(`${authenticatedWebUrl}/`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto(`${authenticatedWebUrl}/quotes/new`);
    await expect(page).toHaveURL(`${authenticatedWebUrl}/quotes/new`);
    await expect(page.getByRole("heading", { name: "New Quote" })).toBeVisible();

    await context.close();
  } finally {
    if (companyId !== undefined) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId));
      await db
        .delete(customersTable)
        .where(eq(customersTable.companyId, companyId));
      await db
        .delete(priceBookItemsTable)
        .where(eq(priceBookItemsTable.companyId, companyId));
      await db
        .delete(companySettingsTable)
        .where(eq(companySettingsTable.companyId, companyId));
      await db
        .delete(companyMembersTable)
        .where(eq(companyMembersTable.userId, userId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  }
});


test("saved quote links work directly and stale proposal links stay unavailable", async ({
  browser,
  request,
}) => {
  const marker = randomUUID();
  const userId = `quote_direct_links_ui_${marker}`;
  let companyId: number | undefined;
  let quoteId: number | undefined;
  let authenticatedContext: BrowserContext | undefined;
  let publicContext: BrowserContext | undefined;

  const jobInputs: AdditionInputRecord = {
    length: 20,
    width: 16,
    receptacles: 4,
    switches: 2,
    dimmers: 0,
    recessedLights: 0,
    ceilingFans: 0,
    customerSuppliedFans: true,
    circuitCount: 1,
    routeLength: 50,
    homeRunLength: 50,
    panelManufacturer: "Siemens",
    breakerAmperage: 20,
    breakerPoleCount: 1,
    breakerProtectionType: "AFCI",
    cableType: "12/2 NM-B",
    circuitEntries: [
      {
        amperage: 20,
        poleCount: 1,
        protectionType: "AFCI",
        cableType: "12/2 NM-B",
        quantity: 1,
      },
    ],
    subpanelOption: "No Subpanel",
    feederDistance: 50,
    crewSize: 1,
    crewHours: 8,
    laborAdjustmentHours: 0,
    laborRateType: "residential",
    notes: "",
  };

  try {
    const settingsResponse = await request.get(`${apiUrl}/api/settings`, {
      headers: { "x-test-clerk-user-id": userId },
    });
    expect(settingsResponse.ok()).toBe(true);

    const [membership] = await db
      .select({ companyId: companyMembersTable.companyId })
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));
    expect(membership).toBeTruthy();
    companyId = membership!.companyId;

    const [quote] = await db
      .insert(quotesTable)
      .values({
        companyId,
        quoteNumber: `DIRECT-${marker.slice(0, 8)}`,
        customerName: `Direct link customer ${marker}`,
        customerEmail: `direct-${marker}@example.com`,
        projectName: `Direct link quote ${marker}`,
        module: "ADDITION",
        status: "ready",
        jobInputs,
        assembly: [
          {
            id: "direct-link-receptacles",
            category: "Devices",
            description: "Duplex receptacle",
            quantity: 4,
            unit: "ea",
            unitCost: 8.5,
            extendedCost: 34,
            source: "Direct link browser fixture",
          },
        ],
        pricing: {
          materialCost: 34,
          laborCost: 300,
          materialMarkup: 0.25,
          calculatedSellingPrice: 600,
          finalSellingPrice: 600,
          laborOverride: null,
          sellingPriceOverride: null,
          grossProfit: 266,
          grossMargin: 0.4433,
          pricingWarnings: [],
        },
        proposalDescription:
          "Install the listed electrical addition scope and complete final testing.",
        total: 600,
        margin: 0.4433,
      })
      .returning({ id: quotesTable.id });
    expect(quote).toBeTruthy();
    quoteId = quote!.id;

    authenticatedContext = await browser.newContext({
      extraHTTPHeaders: { "x-test-clerk-user-id": userId },
    });
    const authenticatedPage = await authenticatedContext.newPage();

    await authenticatedPage.goto(`${authenticatedWebUrl}/quotes/${quoteId}`);
    await expect(authenticatedPage).toHaveURL(
      `${authenticatedWebUrl}/quotes/${quoteId}`,
    );
    await expect(
      authenticatedPage.getByRole("heading", {
        name: `Direct link quote ${marker}`,
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText("Pricing Summary", { exact: true }),
    ).toBeVisible();

    await authenticatedPage.reload();
    await expect(authenticatedPage).toHaveURL(
      `${authenticatedWebUrl}/quotes/${quoteId}`,
    );
    await expect(
      authenticatedPage.getByRole("heading", {
        name: `Direct link quote ${marker}`,
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText("Pricing Summary", { exact: true }),
    ).toBeVisible();

    const proposalResponse = await request.patch(
      `${apiUrl}/api/quotes/${quoteId}`,
      {
        headers: { "x-test-clerk-user-id": userId },
        data: { status: "ready" },
      },
    );
    expect(proposalResponse.ok()).toBe(true);
    const proposal = (await proposalResponse.json()) as {
      proposalShareToken: string | null;
    };
    expect(proposal.proposalShareToken).toBeTruthy();

    publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(
      `${anonymousWebUrl}/proposals/${proposal.proposalShareToken}`,
    );
    await expect(publicPage).toHaveURL(
      `${anonymousWebUrl}/proposals/${proposal.proposalShareToken}`,
    );
    await expect(
      publicPage.getByText("Customer Proposal", { exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("heading", {
        name: `Direct link quote ${marker}`,
      }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("button", { name: "Print proposal" }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("Electrical material", { exact: true }),
    ).toBeVisible();
    await expect(publicPage.getByText("$600.00")).toBeVisible();
    await expect(
      publicPage.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);

    const oldProposalUrl = `${anonymousWebUrl}/proposals/${proposal.proposalShareToken}`;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const updateResponse = await request.patch(
      `${apiUrl}/api/quotes/${quoteId}`,
      {
        headers: { "x-test-clerk-user-id": userId },
        data: {
          proposalDescription:
            "Updated scope requiring a newly issued customer proposal link.",
        },
      },
    );
    expect(updateResponse.ok()).toBe(true);
    const updatedQuote = (await updateResponse.json()) as {
      proposalShareToken: string | null;
    };
    expect(updatedQuote.proposalShareToken).toBeTruthy();
    expect(updatedQuote.proposalShareToken).not.toBe(proposal.proposalShareToken);

    await publicPage.goto(oldProposalUrl);
    await expect(publicPage.getByTestId("proposal-unavailable")).toBeVisible();
    await expect(
      publicPage.getByRole("heading", { name: "Proposal unavailable" }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("Electrical material", { exact: true }),
    ).toHaveCount(0);
    await expect(publicPage.getByText("$600.00")).toHaveCount(0);
    await expect(
      publicPage.getByRole("heading", {
        name: `Direct link quote ${marker}`,
      }),
    ).toHaveCount(0);
  } finally {
    await publicContext?.close();
    await authenticatedContext?.close();
    if (companyId !== undefined) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId));
      await db
        .delete(customersTable)
        .where(eq(customersTable.companyId, companyId));
      await db
        .delete(priceBookItemsTable)
        .where(eq(priceBookItemsTable.companyId, companyId));
      await db
        .delete(companySettingsTable)
        .where(eq(companySettingsTable.companyId, companyId));
      await db
        .delete(companyMembersTable)
        .where(eq(companyMembersTable.userId, userId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  }
});