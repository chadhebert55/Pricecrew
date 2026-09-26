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

type JobberImportFixture = {
  maxLineItems: number;
  baseHeaders: string[];
  lineItemHeaderTemplates: string[];
  requiredMappings: Array<{ name: string; headers: string[] }>;
  lineItemRules: {
    savedTotalName: string;
  };
};

const jobberImportFixture = JSON.parse(
  await readFile(
    new URL(
      "../../artifacts/api-server/src/lib/jobber-quote-import.fixture.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as JobberImportFixture;

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\r" || character === "\n") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  return rows;
}

function jobberLineHeaders(lineNumber: number) {
  return jobberImportFixture.lineItemHeaderTemplates.map((header) =>
    header.replace("{lineNumber}", String(lineNumber)),
  );
}

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

for (const exportCase of ["standard", "legacy closeout labor", "large panel assembly"]) {
const withLegacyCloseout = exportCase !== "standard";
const withLargeAssembly = exportCase === "large panel assembly";
test(`saved quote export preserves the exact saved total: ${exportCase}`, async ({
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
        module: withLegacyCloseout ? "PANEL_REPLACEMENT" : "ADDITION",
        status: "ready",
        jobInputs: withLegacyCloseout ? {
          replacementType: "Like-for-like panel replacement", panelManufacturer: "Siemens",
          panelAmperage: 200, panelSpaceCount: 40, breakerAmperage: 200,
          breakerPoleCount: 2, breakerProtectionType: "Standard",
          feederConductor: "Reuse existing cable", feederLength: 15,
          feederConductorQuantity: 1, includeFeederRaceway: false,
          feederRacewayFootage: 0, feederRacewayFittingsQuantity: 0,
          groundBarQuantity: 0, groundRodQuantity: 0, groundingConductorFootage: 0,
          bondingConductorFootage: 0, existingBreakers: [], existingOtherBreakerQuantity: 0,
          fillerPlateQuantity: 0, knockoutSealQuantity: 0, plywoodQuantity: 0,
          studsQuantity: 0, antiOxidantQuantity: 0, electricalTapeQuantity: 0,
          permitAllowance: 0, inspectionAllowance: 0, miscellaneousAllowance: 0,
          allowancesNotRequired: { permit: true, inspection: true, miscellaneous: true },
          crewSize: 1, crewHours: 8, panelRemovalLaborHours: 0,
          feederInstallationLaborHours: 0, groundingLaborHours: 0,
          accessDifficultyLaborHours: 0, generalLaborAdjustmentHours: 0,
          laborRateType: "residential", notes: "",
        } : jobInputs,
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
          ...(withLegacyCloseout ? [{
            id: "panel-replacement-closeout", category: "Closeout",
            description: "Prepare panel directory and complete final circuit labeling",
            quantity: 1, unit: "scope", unitCost: 0, extendedCost: 0,
            source: "Included labor scope",
          }] : []),
          ...(withLargeAssembly ? Array.from({ length: 27 }, (_, index) => ({
            id: ["panel-ground-bars", "panel-space-fillers", "panel-knockout-seals",
              "panel-electrical-tape", "panel-anti-oxidant", "panel-plywood"][index] ?? `large-material-${index}`, category: "Material",
            description: `Saved panel material ${index + 1}`,
            quantity: 1, unit: "ea", unitCost: 1, extendedCost: 1,
            source: "Saved supplier fixture",
          })) : []),
        ],
        pricing: {
          materialCost: withLargeAssembly ? 211 : 184,
          laborCost: 480,
          materialMarkup: 0.25,
          calculatedSellingPrice: 2210,
          finalSellingPrice,
          laborOverride: null,
          sellingPriceOverride: finalSellingPrice,
          grossProfit: withLargeAssembly ? 1654.67 : 1680.67,
          grossMargin: withLargeAssembly ? 1654.67 / finalSellingPrice : 0.7165,
          pricingWarnings: [],
        },
        proposalDescription:
          "Install the listed electrical scope and complete final testing.",
        total: finalSellingPrice,
        margin: withLargeAssembly ? 1654.67 / finalSellingPrice : 0.7165,
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
    if (withLegacyCloseout) {
      const [before] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
      await expect(page.getByText("Pricing must be resolved before export")).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("Pricing must be resolved before export")).toHaveCount(0);
      const [after] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
      expect(after.status).toBe("ready");
      expect(after.assembly).toEqual(before.assembly);
      expect(after.total).toBe(before.total);
      expect(after.pricing).toEqual(before.pricing);
    }

    const readiness = page.getByTestId("export-readiness");
    await expect(readiness).toContainText("Jobber export readiness");
    await expect(readiness).toContainText(
      "Jobber needs a mapped Property ID or Property Street 1",
    );
    await expect(readiness).toContainText(`${withLargeAssembly ? 1 : withLegacyCloseout ? 4 : 3} of 10 line items`);
    if (withLargeAssembly) {
      await expect(page.getByTestId("jobber-summary-notice")).toContainText("All 30 saved assembly rows are retained");
      await expect(page.getByTestId("button-revise-for-export")).toHaveCount(0);
      const preflight = await context.request.post(`${apiUrl}/api/quotes/${quoteId}/exports/preflight`, {
        data: { destination: "jobber", format: "csv", mapping: { propertyStreet1: "123 Main St" } },
      });
      expect(preflight.ok()).toBe(true);
      expect(await preflight.json()).toMatchObject({ ready: true, lineItemCount: 1, quoteTotal: finalSellingPrice });
    }
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
    const [headers, values] = parseCsvRows(csv);
    const expectedHeaders = [
      ...jobberImportFixture.baseHeaders,
      ...Array.from({ length: jobberImportFixture.maxLineItems }, (_, index) =>
        jobberLineHeaders(index + 1),
      ).flat(),
    ];
    expect(headers, "Jobber import header contract").toEqual(expectedHeaders);
    expect(values, "Jobber import row width").toHaveLength(headers.length);

    const valueFor = (header: string) => values[headers.indexOf(header)] ?? "";
    for (const requirement of jobberImportFixture.requiredMappings) {
      expect(
        requirement.headers.some(
          (header) => valueFor(header).trim().length > 0,
        ),
        `Jobber required ${requirement.name} mapping`,
      ).toBe(true);
    }
    expect(valueFor("Client Email")).toBe(`jobber-${marker}@example.com`);
    expect(valueFor("Property Street 1")).toBe("123 Main St");

    const lineItemWidth = jobberImportFixture.lineItemHeaderTemplates.length;
    const lineItemValues = (lineNumber: number) =>
      values.slice(
        jobberImportFixture.baseHeaders.length +
          (lineNumber - 1) * lineItemWidth,
        jobberImportFixture.baseHeaders.length + lineNumber * lineItemWidth,
      );
    if (withLargeAssembly) {
      const [saved] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
      const note = valueFor("Quote Internal Note");
      expect(JSON.parse(note.slice(note.indexOf("\n") + 1))).toEqual(saved.assembly);
      expect(lineItemValues(1)[0]).toBe("Service");
      expect(lineItemValues(1)[1]).toBe("Saved quote total");
      expect(lineItemValues(1)[3]).toBe("1");
      expect(lineItemValues(1)[4]).toBe("2345.67");
      expect(lineItemValues(1)[5]).toBe("");
      expect(lineItemValues(1)[2]).toContain("Panel grounding bars | Quantity: 1 ea");
      expect(lineItemValues(1)[2]).toContain("Electrical insulating tape | Quantity: 1 ea");
      expect(lineItemValues(1)[2]).not.toContain("Saved supplier fixture");
      expect(lineItemValues(1)[2].split("| Quantity:")).toHaveLength(31);
      for (let slot = 2; slot <= 10; slot++) expect(lineItemValues(slot)).toEqual(["", "", "", "", "", "", ""]);
      expect(saved.assembly).toHaveLength(30);
      expect(saved.total).toBe(finalSellingPrice);
      await page.getByTestId("select-export-destination").click();
      await page.getByRole("option", { name: "QuickBooks Online" }).click();
      await expect(page.getByTestId("quickbooks-import-notice")).toContainText("not a customer-facing quote");
      await expect(page.getByTestId("button-download-quote-csv")).toHaveText("Download CSV for Import");
      await page.getByTestId("button-open-customer-quote").click();
      await expect(page).toHaveURL(/\/proposals\//);
      await expect(page.getByRole("heading", { name: "Included Scope" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "Grounding & bonding", exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: "Panel installation materials", exact: true })).toBeVisible();
      await expect(page.locator(".customer-proposal")).not.toContainText("Saved supplier fixture");
      await expect(page.locator(".customer-proposal")).not.toContainText("Gross Profit");
      await expect(page.locator(".customer-proposal")).toContainText("$2,345.67");
      await page.evaluate('window.print = () => { document.body.dataset.printCalled = "true"; }');
      await page.getByTestId("button-print-customer-quote").click();
      await expect(page.locator("body")).toHaveAttribute("data-print-called", "true");
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: test.info().outputPath("customer-proposal-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: test.info().outputPath("customer-proposal-mobile.png"), fullPage: true });
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      await page.evaluate('document.documentElement.classList.add("dark")');
      await page.emulateMedia({ media: "print" });
      await expect(page.getByTestId("button-print-customer-quote")).toBeHidden();
      await expect(page.getByTestId("toast-title")).toBeHidden();
      expect(await page.evaluate('getComputedStyle(document.querySelector(".customer-proposal")).backgroundColor')).toBe("rgb(255, 255, 255)");
      expect(await page.evaluate('getComputedStyle(document.querySelector(".customer-proposal td")).color')).toBe("rgb(17, 17, 17)");
      await page.screenshot({ path: test.info().outputPath("customer-proposal-print.png"), fullPage: true });
      await page.emulateMedia({ media: "screen" });
      await page.evaluate('document.documentElement.classList.remove("dark")');
      await page.goto(`/quotes/${quoteId}`);
      await expect(readiness).toBeVisible();
    } else {
    expect(lineItemValues(1)).toEqual([
      "Product",
      "12/2 NM-B cable",
      "Saved assembly category: Wiring; Unit: ft; Source: Saved quote fixture; Saved extended cost: $150.00",
      "120",
      "",
      "1.25",
      "",
    ]);
    expect(lineItemValues(2)).toEqual([
      "Product",
      "Duplex receptacle",
      "Saved assembly category: Devices; Unit: ea; Source: Saved quote fixture; Saved extended cost: $34.00",
      "4",
      "",
      "8.50",
      "",
    ]);
    if (withLegacyCloseout) {
      expect(lineItemValues(3)).toEqual([
        "Service", "Prepare panel directory and complete final circuit labeling",
        "Saved assembly category: Closeout; Unit: scope; Source: Included labor scope; Saved extended cost: $0.00",
        "1", "", "0.00", "",
      ]);
    }
    expect(lineItemValues(withLegacyCloseout ? 4 : 3)).toEqual([
      "Service",
      jobberImportFixture.lineItemRules.savedTotalName,
      "Exact saved final selling price; assembly rows preserve saved costs without per-line selling prices.",
      "1",
      "2345.67",
      "",
      "",
    ]);
    for (
      let lineNumber = withLegacyCloseout ? 5 : 4;
      lineNumber <= jobberImportFixture.maxLineItems;
      lineNumber += 1
    ) {
      expect(
        lineItemValues(lineNumber),
        `Jobber line item ${lineNumber} after saved total`,
      ).toEqual(["", "", "", "", "", "", ""]);
    }
    }
    if (withLegacyCloseout) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await readiness.scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("closeout-export-desktop.png") });
      await page.setViewportSize({ width: 375, height: 812 });
      await readiness.scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("closeout-export-mobile.png") });
      const [saved] = await db.select().from(quotesTable).where(eq(quotesTable.id, quoteId));
      expect(saved.assembly[2].intentionalExclusionReason).toBeUndefined();
      expect(saved.total).toBe(finalSellingPrice);
      await db.update(quotesTable).set({
        status: "draft",
        assembly: [...saved.assembly, {
          id: "missing-ground-bar", category: "Material", description: "Ground bar",
          quantity: 1, unit: "ea", unitCost: 0, extendedCost: 0,
          source: "Included labor scope",
        }],
      }).where(eq(quotesTable.id, quoteId));
      await page.reload();
      await expect(page.getByText("Pricing must be resolved before export")).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark Ready", exact: true })).toBeDisabled();
      await expect(page.getByTestId("button-download-quote-csv")).toBeDisabled();
    }
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
}
