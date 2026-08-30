import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

test("saved quote export preflight leads to a Jobber CSV with the exact saved total", async ({
  browser,
}) => {
  const marker = randomUUID();
  const userId = `quote_export_ui_${marker}`;
  const finalSellingPrice = 2345.67;
  let companyId: number | undefined;
  let quoteId: number | undefined;
  let context: BrowserContext | undefined;

  try {
    const [company] = await db
      .insert(companiesTable)
      .values({ name: `Quote export contractor ${marker}` })
      .returning({ id: companiesTable.id });
    expect(company).toBeTruthy();
    companyId = company!.id;

    await db.insert(companyMembersTable).values({
      userId,
      companyId,
      role: "owner",
    });

    const [quote] = await db
      .insert(quotesTable)
      .values({
        companyId,
        quoteNumber: `EXPORT-${marker.slice(0, 8)}`,
        customerName: `Jobber customer ${marker}`,
        customerEmail: `jobber-${marker}@example.com`,
        projectName: `Jobber export quote ${marker}`,
        module: "ADDITION",
        status: "ready",
        jobInputs,
        assembly: [
          {
            id: "export-wire",
            category: "Wiring",
            description: "12/2 NM-B cable",
            quantity: 120,
            unit: "ft",
            unitCost: 1.25,
            extendedCost: 150,
            source: "Saved quote fixture",
          },
          {
            id: "export-receptacles",
            category: "Devices",
            description: "Duplex receptacle",
            quantity: 4,
            unit: "ea",
            unitCost: 8.5,
            extendedCost: 34,
            source: "Saved quote fixture",
          },
        ],
        pricing: {
          materialCost: 184,
          laborCost: 480,
          materialMarkup: 0.25,
          calculatedSellingPrice: 2210,
          finalSellingPrice,
          laborOverride: null,
          sellingPriceOverride: finalSellingPrice,
          grossProfit: 1680.67,
          grossMargin: 0.7165,
          pricingWarnings: [],
        },
        proposalDescription:
          "Install the listed electrical scope and complete final testing.",
        total: finalSellingPrice,
        margin: 0.7165,
      })
      .returning({ id: quotesTable.id });
    expect(quote).toBeTruthy();
    quoteId = quote!.id;

    context = await browser.newContext({
      extraHTTPHeaders: {
        "x-test-clerk-user-id": userId,
      },
    });
    const page = await context.newPage();

    await page.goto(`/quotes/${quoteId}`);
    await expect(
      page.getByRole("heading", { name: `Jobber export quote ${marker}` }),
    ).toBeVisible();

    const readiness = page.getByTestId("export-readiness");
    await expect(readiness).toContainText("Jobber export readiness");
    await expect(readiness).toContainText(
      "Jobber needs a mapped Property ID or Property Street 1",
    );
    await expect(readiness).toContainText("3 of 10 line items");
    await expect(readiness).toContainText(
      "Includes one line for the exact saved quote total.",
    );

    const exportButton = page.getByTestId("button-download-quote-csv");
    await exportButton.click();
    const exportIssues = page.getByTestId("alert-export-issues");
    await expect(exportIssues).toBeVisible();
    await expect(exportIssues).toContainText(
      "Provide a Jobber Property ID or Property Street 1",
    );

    await page.getByTestId("input-export-propertyStreet1").fill("123 Main St");
    await expect(readiness).toContainText(
      "A mapped Jobber Property ID or property street is supplied.",
    );
    await expect(page.getByTestId("alert-export-issues")).toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const csv = await readFile(downloadedPath!, "utf8");
    expect(csv).toContain('"Saved quote total"');
    expect(csv).toMatch(/"Saved quote total".*"2345\.67"/);
  } finally {
    await context?.close();
    if (companyId !== undefined) {
      await db.delete(quotesTable).where(eq(quotesTable.companyId, companyId));
      await db
        .delete(companyMembersTable)
        .where(eq(companyMembersTable.userId, userId));
      await db
        .delete(customersTable)
        .where(eq(customersTable.companyId, companyId));
      await db
        .delete(priceBookItemsTable)
        .where(eq(priceBookItemsTable.companyId, companyId));
      await db
        .delete(companySettingsTable)
        .where(eq(companySettingsTable.companyId, companyId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  }
});