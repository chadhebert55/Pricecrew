import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  db,
  companyMembersTable,
  companySettingsTable,
  companiesTable,
  priceBookItemsTable,
  quotesTable,
  customersTable,
} from "@workspace/db";
test("Addition rooms: unified circuits, explicit feeder, responsive draft/revise, immutable financial and proposal snapshots", async ({
  browser,
  request,
}, info) => {
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw Error("Disposable local database only");
  const api = "http://127.0.0.1:5080/api",
    headers = { "x-test-clerk-user-id": `rooms_${randomUUID()}` };
  await request.get(`${api}/settings`, { headers });
  const [member] = await db
    .select()
    .from(companyMembersTable)
    .where(eq(companyMembersTable.userId, headers["x-test-clerk-user-id"]));
  const companyId = member!.companyId;
  const context = await browser.newContext({
    extraHTTPHeaders: headers,
    viewport: { width: 1440, height: 1000 },
  });
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
    const fixtures = JSON.parse(
      await readFile(
        new URL("./customer-scope-fixtures.json", import.meta.url),
        "utf8",
      ),
    );
    const old = fixtures.find((f: any) => f.module === "ADDITION");
    const historical = await (
      await request.post(`${api}/quotes`, {
        headers,
        data: {
          ...old,
          jobInputs: { ...old.jobInputs, additionScopeVersion: 2 },
        },
      })
    ).json();
    for (const [material, price] of [
      ["Aluminum", 2],
      ["Copper", 4],
    ] as const) {
      await db
        .insert(priceBookItemsTable)
        .values({
          companyId,
          item: `Synthetic ${material} SER qualified test product`,
          unit: "ft",
          unitCost: price,
          category: "Conductor",
          manufacturer: "QA",
          manufacturerPartNumber: `QA-${material}`,
          supplier: "Synthetic",
          supplierSku: `QA-${material}`,
          sourceDate: "2026-10-02",
          isDefault: false,
        });
    }
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/price-book");
    const products=await(await request.get(`${api}/price-book`,{headers})).json();
    for(const material of ["Aluminum","Copper"]){
      await page.locator("#component-request").selectOption(`Addition 60A ${material} SER feeder`);
      await page.locator("#component-product").selectOption(String(products.find((p:any)=>p.manufacturerPartNumber===`QA-${material}`).id));
      await page.locator("#component-source").fill("Synthetic isolated test qualification, not company approved product");
      await page.locator("#component-confirm").check();
      await page.getByRole("button",{name:"Save component mapping",exact:true}).click();
      await expect(page.getByTestId("component-status")).toHaveText("Verified / Priced");
    }
    await page.screenshot({path:info.outputPath("addition-feeder-pricebook.png"),fullPage:true});
    await page.goto("/quotes/new/addition");
    await page.locator("#addition-customer").fill("QA Room Package");
    await page
      .locator("#addition-project")
      .fill("QA Addition Bathroom Laundry Subpanel");
    await page.locator("#addition-notes").fill("INTERNAL SECRET ROOM NOTE");
    await page.locator("#addition-ceilingFans").fill("0");
    await page.locator("#addition-room-bathroom").check();
    await page.locator("#addition-room-laundry").check();
    await page.locator("#addition-laundry-dryer").selectOption("Gas");
    await expect(
      page.locator('input[value="Laundry — Electric Dryer"]'),
    ).toHaveCount(0);
    await page.locator("#addition-laundry-dryer").selectOption("Electric");
    await expect(page.locator("#addition-circuit-4-label")).toHaveValue(
      "Laundry — Electric Dryer",
    );
    await page.locator("#addition-circuit-1-length").fill("75");
    await page.locator("#addition-circuit-2-length").fill("30");
    await page.locator("#addition-exhaust-supply").selectOption("customer");
    await page
      .locator("#addition-exhaust-control")
      .selectOption("Standard switch");
    await page.locator("#addition-exhaust-wire").fill("30");
    for (let index = 1; index <= 4; index++)
      await page.locator(`#addition-circuit-${index}-reviewed`).check();
    await page.locator("#addition-add-subpanel").selectOption("yes");
    await expect(page.locator("#addition-feeder-material")).toHaveValue("");
    await page.locator("#addition-feeder-material").selectOption("Aluminum");
    await page.locator("#addition-feeder-distance").fill("50");
    await page.locator("#addition-subpanel-labor").fill("12");
    await page.locator("#addition-crew-size").fill("2");
    await page.locator("#addition-crew-hours").fill("8");
    const previewResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/quotes/preview") &&
        r.request().postDataJSON().jobInputs.laborAdjustmentHours === 2,
    );
    await page.locator("#addition-labor-adjustment").fill("2");
    const preview = await (await previewResponse).json();
    expect(
      preview.assembly.filter((l: any) =>
        /^addition-circuit-\d+-breaker$/.test(l.id),
      ),
    ).toHaveLength(5);
    expect(
      preview.assembly
        .filter((l: any) => /^addition-circuit-\d+-cable$/.test(l.id))
        .map((l: any) => l.quantity),
    ).toEqual([100, 75, 30, 50, 50]);
    expect(
      preview.assembly.find((l: any) => l.id === "addition-subpanel-feeder")
        .extendedCost,
    ).toBe(100);
    expect(
      preview.assembly.find((l: any) => l.id === "addition-exhaust-fans")
        .extendedCost,
    ).toBe(0);
    expect(preview.pricing.finalLaborHours).toBeCloseTo(
      preview.pricing.calculatedLaborHours + 2,
      6,
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(localStorage).some(
            (raw) =>
              raw.includes('"feederMaterial":"Aluminum"') &&
              raw.includes('"laborAdjustmentHours":2'),
          ),
        ),
      )
      .toBe(true);
    await page.reload();
    await page.getByTestId("button-restore-quote-draft").click();
    for (const [id, value] of [
      ["addition-feeder-material", "Aluminum"],
      ["addition-subpanel-labor", "12"],
      ["addition-circuit-1-length", "75"],
      ["addition-circuit-2-length", "30"],
      ["addition-laundry-dryer", "Electric"],
    ])
      await expect(page.locator(`#${id}`)).toHaveValue(value);
    await expect(page.locator("#addition-room-bathroom")).toBeChecked();
    await expect(page.locator("#addition-room-laundry")).toBeChecked();
    for (const [name, width] of [
      ["desktop", 1440],
      ["tablet", 834],
      ["mobile", 390],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [section, selector] of [
        ["rooms", "#addition-room-bathroom"],
        ["circuits", "#addition-circuit-1-label"],
        ["subpanel", "#addition-feeder-material"],
      ] as const) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        expect(
          await page.evaluate(
            "document.documentElement.scrollWidth <= innerWidth",
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`addition-${name}-${section}.png`),
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const save = page.waitForResponse(
      (r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Generate Addition Quote", exact: true })
      .click();
    const saved = await (await save).json();
    expect(saved.pricing).toEqual(preview.pricing);
    expect(saved.assembly).toEqual(preview.assembly);
    expect(saved.customerScopeReview).toEqual([]);
    const p = saved.pricing,
      round = (n: number) => Math.round(n * 100) / 100;
    expect(p.materialCost).toBe(
      round(
        saved.assembly.reduce((s: number, l: any) => s + l.extendedCost, 0),
      ),
    );
    expect(p.laborCost).toBe(round(p.finalLaborHours * 65));
    expect(p.laborSellAmount).toBe(round(p.finalLaborHours * 150));
    expect(p.grossProfit).toBe(
      round(p.finalSellingPrice - p.materialCost - p.laborCost),
    );
    expect(p.grossMargin).toBeCloseTo(p.grossProfit / p.finalSellingPrice, 4);
    expect(
      (
        await request.patch(`${api}/quotes/${saved.id}`, {
          headers,
          data: { status: "ready" },
        })
      ).status(),
    ).toBe(409);
    await page.screenshot({
      path: info.outputPath("addition-internal.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Customer View", exact: true })
      .click();
    const customer = page.getByTestId("customer-view-preview");
    await expect(customer).toContainText("Bathroom electrical installation");
    await expect(customer).toContainText("Laundry electrical installation");
    await expect(customer).toContainText("aluminum SER feeder");
    await expect(customer).toContainText("customer-supplied");
    await expect(customer).not.toContainText(
      /Electrical material|Circuit breaker|QA-Aluminum|INTERNAL SECRET|Gross Margin|person-hours|unitCost/,
    );
    await expect(customer).toContainText(saved.total.toFixed(2));
    await page.screenshot({
      path: info.outputPath("addition-customer-review-only.png"),
      fullPage: true,
    });
    await page.getByTestId("button-duplicate-quote").click();
    await expect(page.locator("#addition-feeder-material")).toHaveValue(
      "Aluminum",
    );
    const refreshed = page.waitForResponse(
      (r) =>
        r.url().endsWith("/quotes/preview") &&
        r.request().postDataJSON().jobInputs.feederMaterial === "Copper",
    );
    await page.locator("#addition-feeder-material").selectOption("Copper");
    const copper = await (await refreshed).json();
    expect(
      copper.assembly.find((l: any) => l.id === "addition-subpanel-feeder")
        .extendedCost,
    ).toBe(200);
    expect(copper.pricing.finalLaborHours).toBe(p.finalLaborHours);
    const revisedResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Generate Addition Quote", exact: true })
      .click();
    const revised = await (await revisedResponse).json();
    expect(revised.id).not.toBe(saved.id);
    await db
      .update(priceBookItemsTable)
      .set({ unitCost: 999 })
      .where(eq(priceBookItemsTable.companyId, companyId));
    for (const original of [historical, saved]) {
      const reopened = await (
        await request.get(`${api}/quotes/${original.id}`, { headers })
      ).json();
      expect(reopened.pricing).toEqual(original.pricing);
      expect(reopened.assembly).toEqual(original.assembly);
      expect(reopened.customerScope).toEqual(original.customerScope);
      expect(reopened.total).toBe(original.total);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    for (const table of [
      quotesTable,
      customersTable,
      priceBookItemsTable,
      companySettingsTable,
      companyMembersTable,
    ])
      await db.delete(table).where(eq(table.companyId, companyId));
    await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  }
});
