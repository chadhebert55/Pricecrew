import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import { db, companyMembersTable, quotesTable, customersTable, priceBookItemsTable, companySettingsTable, companiesTable } from "@workspace/db";

const api = "http://127.0.0.1:5080/api";
const requireApi = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const {PDFParse} = requireApi("pdf-parse");

async function cleanup(companyId: number) {
  for (const table of [quotesTable, customersTable, priceBookItemsTable, companySettingsTable, companyMembersTable])
    await db.delete(table).where(eq(table.companyId, companyId));
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
}

test("P0 T&M current and legacy saved identifiers can open the revision builder", async () => {
  // Runtime import keeps the frontend source in its own TS project.
  const modulePath = "../../artifacts/electrical-estimator/src/lib/quote-builder-routes.ts";
  const {canonicalQuoteModule, quoteBuilderRoute} = await import(modulePath);
  for (const alias of ["TIME_MATERIALS", "Time & Materials", "Time and Materials Builder"]) {
    expect(canonicalQuoteModule(alias), alias).toBe("TIME_MATERIALS");
    expect(quoteBuilderRoute(alias), alias).toBe("/quotes/new/time-materials");
  }
  expect(canonicalQuoteModule("unknown legacy calculator")).toBeUndefined();
});

test("P0 T&M browser draft restore, Ready, public PDF and revision preserve the saved estimate", async ({browser,request}, info) => {
  test.setTimeout(120_000);
  const userId = `p0_tm_${randomUUID()}`, headers = {"x-test-clerk-user-id":userId};
  await request.get(`${api}/settings`,{headers});
  const [member] = await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId));
  // Isolated QA company only: exercise nonzero labor and materials without
  // touching the user's company settings or changing any pricing formula.
  await db.update(companySettingsTable).set({
    timeMaterialsCrewSize:1, timeMaterialsLaborSellRate:150,
    timeMaterialsLoadedLaborCost:65, timeMaterialsMaterialMarkup:.25,
    timeMaterialsTargetMargin:.4,
  }).where(eq(companySettingsTable.companyId,member!.companyId));
  const context = await browser.newContext({extraHTTPHeaders:headers});
  try {
    const page = await context.newPage();
    const previewLoaded = page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"));
    await page.goto(`/quotes/new/time-materials?draftScope=${userId}`);
    expect((await previewLoaded).request().postDataJSON().module).toBe("TIME_MATERIALS");
    await page.locator("#tm-customer").fill("P0 QA Customer");
    await page.locator("#tm-project").fill("P0 T&M repair");
    await page.locator("#tm-crew-hours").fill("8");
    await page.getByRole("button",{name:"Add Line",exact:true}).click();
    await page.locator('input[id^="mat-desc-"]').fill("Repair supplies");
    await page.locator('input[id^="mat-cost-"]').fill("75");
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("Repair supplies"))).toBe(true);
    await page.reload();
    await page.getByTestId("button-restore-quote-draft").click();
    await expect(page.locator("#tm-project")).toHaveValue("P0 T&M repair");
    await expect(page.locator("#tm-crew-hours")).toHaveValue("8");
    await expect(page.locator('input[id^="mat-cost-"]')).toHaveValue("75");
    const createdResponse = page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate T&M Quote",exact:true}).click();
    const saved = await (await createdResponse).json();
    expect(saved.module).toBe("TIME_MATERIALS");
    expect(saved.total).toBeGreaterThan(75);
    expect(saved.pricing.laborCost).toBeGreaterThan(0);
    await expect(page).toHaveURL(new RegExp(`/quotes/${saved.id}$`));
    const readyResponse = page.waitForResponse(r=>r.url().endsWith(`/api/quotes/${saved.id}`)&&r.request().method()==="PATCH");
    await page.getByRole("button",{name:"Mark Ready",exact:true}).click();
    const readyResult = await readyResponse;
    expect(readyResult.status()).toBe(200);
    const ready = await readyResult.json();
    expect(ready.assembly).toEqual(saved.assembly);
    expect(ready.total).toBe(saved.total);
    await page.getByRole("button",{name:"Customer Proposal",exact:true}).click();
    await expect(page.getByTestId("button-download-customer-pdf")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("button-download-customer-pdf").click();
    const file = info.outputPath("p0-tm-proposal.pdf");
    await (await download).saveAs(file);
    const parser = new PDFParse({data:new Uint8Array(await readFile(file))});
    const pdf = await parser.getText();
    await parser.destroy();
    expect(pdf.text).toContain(saved.total.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
    expect(pdf.text).not.toMatch(/Gross Profit|Gross Margin|Loaded Labor|unitCost/);
    await page.goto(`/quotes/${saved.id}`);
    await page.getByTestId("button-duplicate-quote").click();
    await expect(page).toHaveURL(new RegExp(`/quotes/new/time-materials\\?reviseFrom=${saved.id}$`));
    await expect(page.locator("#tm-crew-hours")).toHaveValue("8");
    await expect(page.locator('input[id^="mat-cost-"]')).toHaveValue("75");
    const revisedResponse = page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate T&M Quote",exact:true}).click();
    const revised = await (await revisedResponse).json();
    expect(revised.id).not.toBe(saved.id);
    expect(revised.module).toBe("TIME_MATERIALS");
    expect(revised.assembly).toEqual(saved.assembly);
    expect(revised.total).toBe(saved.total);
    const original = await (await request.get(`${api}/quotes/${saved.id}`,{headers})).json();
    expect(original.pricing).toEqual(ready.pricing);
    expect(original.assembly).toEqual(ready.assembly);
    expect(original.total).toBe(ready.total);
  } finally { await context.close(); await cleanup(member!.companyId); }
});

test("P0 New House exterior WR remains visibly unresolved with only an indoor preferred TR item", async ({browser,request}) => {
  const userId=`p0_wr_${randomUUID()}`,headers={"x-test-clerk-user-id":userId};
  await request.get(`${api}/settings`,{headers});
  const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId));
  const companyId=member!.companyId;
  const context=await browser.newContext({extraHTTPHeaders:headers});
  try {
    await db.insert(priceBookItemsTable).values({
      companyId,category:"Devices",item:"Pass & Seymour 3232-TRW 15A TR duplex receptacle",unit:"ea",unitCost:1,
      isDefault:false,manufacturer:"Pass & Seymour",manufacturerPartNumber:"3232-TRW",supplierSku:"243085",amperage:15,
      materialPreferences:[{requestKey:"15A TR weather-resistant exterior duplex receptacle",kind:"exact"}],
    });
    const page=await context.newPage();
    const pending=page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"));
    await page.goto(`/quotes/new/new-house?draftScope=${userId}`);
    const preview=await (await pending).json();
    const exterior=preview.assembly.find((line:any)=>line.id==="new-house-exterior-receptacles");
    expect(exterior.unitCost).toBe(0);
    expect(exterior.resolutionStatus).toBe("UNRESOLVED_NEEDS_COMPANY_SELECTION");
    expect(exterior.materialSnapshot).toBeUndefined();
    await expect(page.getByText("Exterior weather-resistant receptacles",{exact:false}).first()).toBeVisible();
    await expect(page.getByText(/15A TR weather-resistant exterior duplex receptacle/).first()).toBeVisible();
    await page.screenshot({path:test.info().outputPath("new-house-wr-review.png"),fullPage:true});
  } finally { await context.close(); await cleanup(companyId); }
});
