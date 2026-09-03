import { expect, test } from "@playwright/test";
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

const jobInputs: AdditionInputRecord = {
  length: 20,
  width: 16,
  receptacles: 6,
  switches: 2,
  dimmers: 1,
  recessedLights: 4,
  ceilingFans: 1,
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

test("quote building and export surfaces work at phone and tablet widths", async ({
  browser,
  request,
}) => {
  const marker = randomUUID();
  const userId = `mobile_quote_ui_${marker}`;
  let companyId: number | undefined;
  let savedQuoteId: number | undefined;

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
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: {
        "x-test-clerk-user-id": userId,
      },
    });
    const page = await context.newPage();

    await page.goto("/quotes/new/addition");
    await expect(page.getByRole("heading", { name: "New Addition Quote" })).toBeVisible();

    const [savedQuote] = await db
      .insert(quotesTable)
      .values({
        companyId,
        quoteNumber: `MOBILE-${marker.slice(0, 8)}`,
        customerName: `Tablet customer ${marker}`,
        customerEmail: `tablet-${marker}@example.com`,
        projectName: `Tablet export quote ${marker}`,
        module: "ADDITION",
        status: "ready",
        jobInputs,
        assembly: Array.from({ length: 5 }, (_, index) => ({
          id: `mobile-line-${index}`,
          category: index % 2 === 0 ? "Devices" : "Wiring",
          description: `Mobile test assembly item ${index + 1}`,
          quantity: index + 1,
          unit: "ea",
          unitCost: 25,
          extendedCost: 25 * (index + 1),
          source: "Responsive browser fixture",
        })),
        pricing: {
          materialCost: 375,
          laborCost: 300,
          materialMarkup: 0.25,
          calculatedSellingPrice: 1500,
          finalSellingPrice: 1500,
          laborOverride: null,
          sellingPriceOverride: null,
          grossProfit: 825,
          grossMargin: 0.55,
          pricingWarnings: [],
        },
        proposalDescription:
          "Provide the listed electrical addition scope and final testing.",
        total: 1500,
        margin: 0.55,
      })
      .returning({ id: quotesTable.id });
    expect(savedQuote).toBeTruthy();
    savedQuoteId = savedQuote!.id;

    await expect(page.getByTestId("button-mobile-navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeHidden();

    await page.getByTestId("button-mobile-navigation").click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Price Book" })).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).last().click();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeHidden();

    await page.locator("#addition-customer").fill(`Phone customer ${marker}`);
    await page.locator("#addition-project").fill(`Phone addition ${marker}`);
    const generateButton = page.getByRole("button", {
      name: "Generate Addition Quote",
    });
    await expect(generateButton).toBeEnabled({ timeout: 20_000 });
    await generateButton.click();
    await expect(page).toHaveURL(/\/quotes\/\d+$/, { timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: `Phone addition ${marker}` }),
    ).toBeVisible();

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/quotes/${savedQuoteId}`);
    await expect(
      page.getByRole("heading", { name: `Tablet export quote ${marker}` }),
    ).toBeVisible();
    await expect(page.getByTestId("button-mobile-navigation")).toBeHidden();
    await expect(page.getByTestId("button-export-quote-header")).toBeVisible();

    const assemblyScroller = page.locator(".table-scroll").last();
    await expect(assemblyScroller).toBeVisible();
    expect(
      await assemblyScroller.evaluate(
        (element) => element.scrollWidth >= element.clientWidth,
      ),
    ).toBe(true);

    await page.getByTestId("button-export-quote-header").click();
    await expect(page.getByTestId("button-download-quote-csv")).toBeVisible();
    await expect(page.getByTestId("select-export-destination")).toBeVisible();
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth",
      ),
    ).toBe(true);

    await page.goto("/price-book");
    await expect(
      page.getByRole("heading", { name: "Price Book", exact: true }),
    ).toBeVisible();
    const priceBookScroller = page.locator(".table-scroll").first();
    await expect(priceBookScroller).toBeVisible();
    expect(
      await priceBookScroller.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);

    const quoteResponse = await request.patch(
      `${apiUrl}/api/quotes/${savedQuoteId}`,
      {
        headers: { "x-test-clerk-user-id": userId },
        data: { status: "ready" },
      },
    );
    expect(quoteResponse.ok()).toBe(true);
    const quote = (await quoteResponse.json()) as {
      proposalShareToken: string | null;
    };
    expect(quote.proposalShareToken).toBeTruthy();

    await page.goto(`/proposals/${quote.proposalShareToken}`);
    await expect(page.getByText("Customer Proposal", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print proposal" })).toBeVisible();
    expect(
      await page.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth",
      ),
    ).toBe(true);

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