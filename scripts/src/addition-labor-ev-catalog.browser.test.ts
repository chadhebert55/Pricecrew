import { expect, test, type Page } from "@playwright/test";
import {configureExhaustOnlyRoom} from "./addition-room-test-helpers";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  db,
  companyMembersTable,
  companySettingsTable,
  priceBookItemsTable,
  priceBookImportsTable,
  quotesTable,
  customersTable,
  companiesTable,
} from "@workspace/db";
// Expected public semantic keys, deliberately independent of implementation constants.
const NEMA_1450 = "NEMA 14-50 receptacle";
const STACKED_CONTROL = "Addition stacked single-pole/single-pole control";
const STACKED_PLATE = "Addition stacked control matching white wall plate";

const api = "http://127.0.0.1:5080/api";
const screenshot = async (page: Page, name: string) => {
  if (process.env.SCOPE_OUTPUT) {
    await mkdir(process.env.SCOPE_OUTPUT, { recursive: true });
    const toast = page.locator('[data-state="open"] [toast-close]');
    if(await toast.count()) await toast.click();
    await expect(toast).toHaveCount(0);
    await page.evaluate("window.scrollTo(0,0)");
    await page.screenshot({
      path: `${process.env.SCOPE_OUTPUT}/${name}.png`,
      fullPage: true,
    });
  }
};
const reconcile = (q: any) => {
  const p = q.pricing,
    round = (n: number) => Math.round(n * 100) / 100;
  expect(p.materialCost).toBe(
    round(q.assembly.reduce((s: number, l: any) => s + l.extendedCost, 0)),
  );
  expect(p.laborCost).toBe(round(p.finalLaborHours * 65));
  expect(p.laborSellAmount).toBe(round(p.finalLaborHours * 150));
  expect(p.grossProfit).toBe(
    round(p.finalSellingPrice - p.materialCost - p.laborCost),
  );
  expect(p.grossMargin).toBeCloseTo(p.grossProfit / p.finalSellingPrice, 4);
};
for (const scenario of ["subpanel", "stacked", "ev"] as const)
  test(`${scenario}: catalog/labor, draft, saved, proposal, revision and snapshot reconciliation`, async ({
    browser,
    request,
  }) => {
    if (
      !["localhost", "127.0.0.1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw Error("Local synthetic database only");
    const userId = `labor_ev_${randomUUID()}`,
      headers = { "x-test-clerk-user-id": userId };
    await request.get(`${api}/settings`, { headers });
    const [member] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, userId));
    const companyId = member!.companyId;
    const context = await browser.newContext({ extraHTTPHeaders: headers });
    await context.route("https://**/*", (r) => {
      const h = { ...r.request().headers() };
      delete h["x-test-clerk-user-id"];
      return r.continue({ headers: h });
    });
    try {
      await db
        .update(companySettingsTable)
        .set({
          residentialLaborSellRate: 150,
          loadedLaborCost: 65,
          materialMarkup: 0.25,
          targetMargin: 0.4,
        })
        .where(eq(companySettingsTable.companyId, companyId));
      await db.insert(priceBookItemsTable).values(
        [
          ["12/2 NM-B cable", 0.6, "Conductor", "ft"],
          ["14/3 NM-B cable", 0.8, "Conductor", "ft"],
          ["8/3 NM-B cable", 1.5, "Conductor", "ft"],
          [
            "Pass & Seymour S1-18-W 1-gang box — SKU 18134",
            3,
            "Rough-in",
            "ea",
          ],
        ].map(([item, unitCost, category, unit]) => ({
          companyId,
          item: String(item),
          unitCost: Number(unitCost),
          category: String(category),
          unit: String(unit),
          supplier: "Synthetic",
          sourceDate: "2026-09-29",
          isDefault: false,
        })),
      );
      await db
        .insert(priceBookItemsTable)
        .values(
          [20, 50].map((a) => ({
            companyId,
            item: `QA Siemens ${a}A breaker`,
            category: "Protection",
            unit: "ea",
            unitCost: 50,
            manufacturer: "Siemens",
            manufacturerPartNumber: a === 50 ? "QF250A" : null,
            amperage: a,
            poleCount: a === 20 ? 1 : 2,
            protectionType: a === 20 ? "AFCI" : "GFCI",
            supplier: "Synthetic",
            sourceDate: "2026-09-29",
            isDefault: false,
          })),
        );
      if (scenario === "stacked") {
        for (const [key, kind, part, cost] of [
          [STACKED_CONTROL, "Stacked single-pole/single-pole", "QA-STACK", 20],
          [STACKED_PLATE, "Matching white wall plate", "QA-PLATE", 3],
        ] as const) {
          await db
            .insert(priceBookItemsTable)
            .values({
              companyId,
              item: `Synthetic ${part}`,
              category: "Controls",
              unit: "ea",
              unitCost: cost,
              manufacturer: "QA",
              manufacturerPartNumber: part,
              supplier: "Synthetic",
              sourceDate: "2026-09-29",
              isDefault: false,
              materialPreferences: [
                {
                  requestKey: key,
                  kind: "exact",
                  verifiedComponent: {
                    kind,
                    manufacturer: "QA",
                    manufacturerPartNumber: part,
                    source: "Synthetic qualification only",
                    plateOpening: "duplex",
                    ...(key === STACKED_PLATE ? {compatibleControl: {
                      manufacturer: "QA", manufacturerPartNumber: "QA-STACK",
                      source: "Isolated synthetic pair approval only",
                    }} : {}),
                  },
                },
              ],
            });
        }
      }
      const page = await context.newPage();
      await page.goto(
        scenario === "ev"
          ? `/quotes/new/ev-charger?draftScope=${userId}`
          : `/quotes/new/addition?draftScope=${userId}`,
      );
      let preview: any;
      if (scenario === "ev") {
        await page.locator("#customerName").fill("QA EV Customer");
        await page.locator("#projectName").fill("QA receptacle workflow");
        await page.locator("#permitRequirement").selectOption("Not Required");
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/quotes/preview") &&
            r.request().postDataJSON().jobInputs.connection ===
              "NEMA 14-50 Receptacle",
        );
        await page
          .locator("select")
          .filter({
            has: page.locator('option[value="NEMA 14-50 Receptacle"]'),
          })
          .selectOption("NEMA 14-50 Receptacle");
        preview = await (await response).json();
        expect(
          preview.assembly.find((l: any) => l.id === "receptacle").unitCost,
        ).toBe(0);
        await expect(
          page.locator('[aria-label="EV Charger unresolved materials"]'),
        ).toContainText(NEMA_1450);
        await screenshot(page, "ev-unresolved");
        const pricebook = await context.newPage();
        await pricebook.goto(
          `/price-book?builder=EV%20Charger&material=${encodeURIComponent(NEMA_1450)}`,
        );
        await expect(pricebook.getByTestId("component-status")).toHaveText(
          "Missing Catalog Item",
        );
        await pricebook
          .getByText("Add or update a product through catalog review", {
            exact: true,
          })
          .click();
        const values = {
          item: "QA verified EV receptacle",
          manufacturer: "QA",
          manufacturerPartNumber: "QA-EV1450",
          supplierSku: "QA-1450-SKU",
          supplier: "Synthetic",
          unitCost: "45",
          sourceDate: "2026-09-29",
        };
        for (const [key, value] of Object.entries(values))
          await pricebook.locator(`#catalog-new-${key}`).fill(value);
        const importResponse = pricebook.waitForResponse(
          (r) =>
            r.url().includes("/price-book/imports/preview") &&
            r.request().method() === "POST",
        );
        await pricebook
          .getByRole("button", {
            name: "Review product before applying",
            exact: true,
          })
          .click();
        expect((await importResponse).ok()).toBe(true);
        await pricebook
          .getByRole("checkbox", { name: "Select CSV row 2", exact: true })
          .check();
        await pricebook.getByTestId("apply-price-book-import").click();
        await expect(
          pricebook
            .locator("#component-product option")
            .filter({ hasText: "QA verified EV receptacle" }),
        ).toHaveCount(1);
        const rows = await db
          .select()
          .from(priceBookItemsTable)
          .where(eq(priceBookItemsTable.companyId, companyId));
        const product = rows.find(
          (r) => r.manufacturerPartNumber === "QA-EV1450",
        )!;
        expect(product).toBeTruthy();
        await pricebook
          .locator("#component-product")
          .selectOption(String(product.id));
        await pricebook
          .locator("#component-source")
          .fill("QA synthetic NEMA 14-50R specification");
        await pricebook.locator("#component-confirm").check();
        await pricebook
          .getByRole("button", { name: "Save component mapping", exact: true })
          .click();
        await expect(pricebook.getByTestId("component-status")).toHaveText(
          "Verified / Priced",
        );
        await screenshot(pricebook, "ev-component-mapping");
        const refreshed = page.waitForResponse((r) =>
          r.url().endsWith("/quotes/preview"),
        );
        await page.bringToFront();
      await page.evaluate("window.dispatchEvent(new Event('focus'))");
        preview = await (await refreshed).json();
        expect(
          preview.assembly.find((l: any) => l.id === "receptacle")
            .materialSnapshot.catalogId,
        ).toBe(product.id);
        expect(
          preview.assembly.find((l: any) => l.id === "receptacle").extendedCost,
        ).toBe(45);
        expect(
          preview.pricing.pricingWarnings.filter(
            (w: any) => w.severity === "error",
          ).map((w: any) => w.code),
        ).toEqual(["EV_RECEPTACLE_INSTALLATION_UNQUALIFIED"]);
        await screenshot(page, "ev-resolved");
        await pricebook.close();
      } else {
        await page.locator("#addition-customer").fill("QA Addition Customer");
        await page.locator("#addition-project").fill(`QA ${scenario}`);
        for (const key of [
          "receptacles",
          "switches",
          "dimmers",
          "recessedLights",
          "ceilingFans",
        ])
          await page.locator(`#addition-${key}`).fill("0");
        await page.locator("#addition-crew-size").fill("2");
        await page.locator("#addition-crew-hours").fill("6");
        if (scenario === "subpanel") {
          await page.locator("#addition-add-subpanel").selectOption("yes");
          await expect(page.locator("#addition-subpanel-labor")).toHaveValue(
            "",
          );
          await expect(
            page.getByText(/Addition subpanel labor: enter total person-hours/),
          ).toBeVisible();
          await page
            .locator("#addition-subpanel-size")
            .selectOption("100A Subpanel");
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith("/quotes/preview") &&
              r.request().postDataJSON().jobInputs.subpanelLaborHours === 12,
          );
          await page.locator("#addition-subpanel-labor").fill("12");
          preview = await (await response).json();
          expect(preview.pricing.finalLaborHours).toBe(26.5); // One 2.5h circuit + 2*6 project hours + 12 subpanel person-hours.
          expect(
            preview.pricing.pricingWarnings.some(
              (w: any) => w.code === "ADDITION_SUBPANEL_LABOR_REQUIRED",
            ),
          ).toBe(false);
        await screenshot(page, "addition-subpanel-labor");
        if(process.env.SCOPE_OUTPUT) await page.locator("#addition-add-subpanel").locator("xpath=../../..").screenshot({path:`${process.env.SCOPE_OUTPUT}/addition-subpanel-labor-field.png`});
        } else {
          await configureExhaustOnlyRoom(page);
          await page.locator("#addition-exhaust-quantity").fill("1");
          await page
            .locator("#addition-exhaust-supply")
            .selectOption("customer");
          await page
            .locator("#addition-exhaust-control")
            .selectOption("Stacked single-pole/single-pole");
          await page.locator("#addition-exhaust-wire").fill("30");
          await page
            .locator("#addition-exhaust-cable")
            .selectOption("14/3 NM-B");
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith("/quotes/preview") &&
              r.request().postDataJSON().jobInputs.bathroomExhaust
                ?.stackedWiringVerified === true,
          );
          await page.locator("#addition-stacked-wiring").check();
          preview = await (await response).json();
          expect(preview.pricing.finalLaborHours).toBe(18.25);
          expect(
            preview.pricing.pricingWarnings.filter(
              (w: any) => w.severity === "error",
            ),
          ).toEqual([]);
        await screenshot(page, "addition-stacked-control");
        if(process.env.SCOPE_OUTPUT) await page.locator('section[aria-labelledby="addition-bathroom-heading"]').screenshot({path:`${process.env.SCOPE_OUTPUT}/addition-stacked-control-fields.png`});
        }
      }
      const expected =
        scenario === "ev"
          ? '"connection":"NEMA 14-50 Receptacle"'
          : scenario === "subpanel"
            ? '"subpanelLaborHours":12'
            : '"stackedWiringVerified":true';
      await expect
        .poll(() =>
          page.evaluate(
            (expected) =>
              Object.values(localStorage).some((raw) => raw.includes(expected)),
            expected,
          ),
        )
        .toBe(true);
      await page.reload();
      await page.getByTestId("button-restore-quote-draft").click();
      if (scenario === "subpanel")
        await expect(page.locator("#addition-subpanel-labor")).toHaveValue(
          "12",
        );
      if (scenario === "stacked")
        await expect(page.locator("#addition-stacked-wiring")).toBeChecked();
      const save = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/quotes") && r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name:
            scenario === "ev" ? "Generate Quote" : "Generate Addition Quote",
          exact: true,
        })
        .click();
      const saved = await (await save).json();
      reconcile(saved);
      expect(saved.assembly).toEqual(preview.assembly);
      expect(saved.pricing).toEqual(preview.pricing);
      const ready = await request.patch(`${api}/quotes/${saved.id}`, {
        headers,
        data: { status: "ready" },
      });
      // A priced receptacle does not qualify the currently unmodeled box/cover.
      expect(ready.status()).toBe(scenario === "stacked" ? 200 : 409);
      const immutableBaseline = await (
        await request.get(`${api}/quotes/${saved.id}`, { headers })
      ).json();
      await screenshot(page, `${scenario}-internal`);
      await page
        .getByRole("button", { name: "Customer View", exact: true })
        .click();
      const customer = page.getByTestId("customer-view-preview");
      await expect(customer).toBeVisible();
      await expect(customer).not.toContainText(
        /Electrical material|QA-EV1450|QA-STACK|Gross Profit|Loaded Internal Labor|Pricing needs confirmation/,
      );
      await expect(customer).toContainText(
        `$${saved.pricing.finalSellingPrice.toFixed(2)}`,
      );
      await screenshot(page, `${scenario}-customer`);
      await page.getByTestId("button-duplicate-quote").click();
      if (scenario === "subpanel")
        await expect(page.locator("#addition-subpanel-labor")).toHaveValue(
          "12",
        );
      if (scenario === "stacked")
        await expect(page.locator("#addition-stacked-wiring")).toBeChecked();
      const revisedResponse = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/quotes") && r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name:
            scenario === "ev" ? "Generate Quote" : "Generate Addition Quote",
          exact: true,
        })
        .click();
      const revised = await (await revisedResponse).json();
      expect(revised.id).not.toBe(saved.id);
      expect(revised.assembly).toEqual(saved.assembly);
      expect(revised.pricing).toEqual(saved.pricing);
      await db
        .update(priceBookItemsTable)
        .set({ unitCost: 999 })
        .where(eq(priceBookItemsTable.companyId, companyId));
      const reopened = await (
        await request.get(`${api}/quotes/${saved.id}`, { headers })
      ).json();
      expect(reopened.assembly).toEqual(immutableBaseline.assembly);
      expect(reopened.pricing).toEqual(immutableBaseline.pricing);
      expect(reopened.jobInputs).toEqual(immutableBaseline.jobInputs);
      if (process.env.SCOPE_OUTPUT)
        await writeFile(
          `${process.env.SCOPE_OUTPUT}/${scenario}-reconciliation.json`,
          JSON.stringify({ preview, saved, revised, reopened }, null, 2),
        );
    } finally {
      await context.close().catch(() => {});
      for (const table of [
        quotesTable,
        customersTable,
        priceBookImportsTable,
        priceBookItemsTable,
        companySettingsTable,
        companyMembersTable,
      ])
        await db.delete(table).where(eq(table.companyId, companyId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }
  });
