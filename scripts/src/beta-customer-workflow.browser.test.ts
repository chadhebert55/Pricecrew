import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { db, companyMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

test("audit customer create edit search quote flow and cross-company API isolation", async ({ browser, request }) => {
  test.skip(!process.env.AUDIT_OUTPUT, "Explicit local audit only");
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))
    throw new Error("Audit requires a local disposable database");
  test.setTimeout(120000);
  const api = "http://127.0.0.1:5080/api";
  const headers = { "x-test-clerk-user-id": `audit_customer_${randomUUID()}` };
  const other = { "x-test-clerk-user-id": `audit_other_${randomUUID()}` };
  expect((await request.get(`${api}/settings`, { headers })).ok()).toBe(true);
  expect((await request.get(`${api}/settings`, { headers: other })).ok()).toBe(true);
  const [member] = await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId, headers["x-test-clerk-user-id"]));
  const [otherMember] = await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId, other["x-test-clerk-user-id"]));
  expect(member!.companyId).not.toBe(otherMember!.companyId);
  expect((await request.patch(`${api}/settings`, { headers, data: {
    companyName: "QA Isolation A",
    residentialLaborSellRate: 150, commercialLaborSellRate: 165,
    loadedLaborCost: 65, materialMarkup: 25, targetMargin: 40,
    customLaborHours: 3, customLaborSellRate: 150, customLoadedLaborCost: 65,
    customMaterialMarkup: 25, customTargetMargin: 40,
  } })).ok()).toBe(true);
  expect((await request.patch(`${api}/settings`, { headers: other, data: { companyName: "QA Isolation B" } })).ok()).toBe(true);
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  await context.route("https://**/*", route => {
    const clean = { ...route.request().headers() }; delete clean["x-test-clerk-user-id"];
    return route.continue({ headers: clean });
  });
  const page = await context.newPage();
  try {
    await page.goto("/customers");
    await page.getByRole("button", { name: "Add Customer", exact: true }).click();
    await page.locator("#new-customer-name").fill("QA Field Customer");
    await page.locator("#new-customer-email").fill("field@example.com");
    await page.getByRole("dialog").getByRole("button", { name: "Add Customer", exact: true }).click();
    await expect(page).toHaveURL(/\/customers\/\d+$/);
    const customerId = Number(page.url().split("/").at(-1));
    await page.getByRole("button", { name: "Edit Customer" }).click();
    await page.locator("#customer-detail-name").fill("QA Field Customer Edited");
    await page.getByRole("button", { name: "Save Customer" }).click();
    await expect(page.getByRole("heading", { name: "QA Field Customer Edited" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "QA Field Customer Edited" })).toBeVisible();
    await page.goto("/customers");
    await page.getByRole("searchbox", { name: "Search customers" }).fill("field@example.com");
    await expect(page.getByRole("link", { name: "QA Field Customer Edited" })).toBeVisible();
    const duplicate = await request.post(`${api}/customers`, { headers, data: { name: "Same email", email: "FIELD@example.com" } });
    expect(duplicate.status()).toBe(409);
    expect((await request.post(`${api}/customers`, { headers, data: { name: "QA Field Customer Edited", email: "different@example.com" } })).status()).toBe(201);
    expect((await request.get(`${api}/customers/${customerId}`, { headers: other })).status()).toBe(404);
    expect((await request.patch(`${api}/customers/${customerId}`, { headers: other, data: { name: "Unauthorized edit" } })).status()).toBe(404);
    expect(await (await request.get(`${api}/customers`, { headers: other })).json()).toEqual([]);
    const items = await (await request.get(`${api}/price-book`, { headers })).json();
    const otherItems = await (await request.get(`${api}/price-book`, { headers: other })).json();
    expect(otherItems.every((item: { id: number }) => !items.some((own: { id: number }) => own.id === item.id))).toBe(true);
    if (items.length) expect((await request.patch(`${api}/price-book/${items[0].id}`, {
      headers: other, data: { unitCost: items[0].unitCost },
    })).status()).toBe(404);
    const scopedSettings = await (await request.get(`${api}/settings?companyId=${member!.companyId}`, { headers: other })).json();
    expect(scopedSettings.companyName).toBe("QA Isolation B");
    await page.goto("/quotes/new/custom");
    await page.getByLabel("Find existing customer").fill("field@example.com");
    await page.getByTestId(`button-select-customer-${customerId}`).click();
    await expect(page.locator("#custom-customer")).toHaveValue("QA Field Customer Edited");
    await expect(page.locator("#custom-email")).toHaveValue("field@example.com");
    await page.locator("#custom-project").fill("QA customer workflow audit");
    await page.locator("#custom-hours").fill("3");
    const saved = page.waitForResponse(r => r.url().endsWith("/api/quotes") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Generate Custom Quote" }).click();
    const response = await saved, quote = await response.json();
    expect(response.ok()).toBe(true);
    expect(quote.total).toBe(450);
    expect(quote.customerId).toBe(customerId);
    expect(quote.customerName).toBe("QA Field Customer Edited");
    await page.goto(`/quotes/${quote.id}`);
    await page.getByRole("button", { name: "Customer View", exact: true }).click();
    await expect(page.getByTestId("customer-view-preview")).toContainText("QA customer workflow audit");
    await expect(page.locator("body")).toContainText("QA Field Customer Edited");
    const ready = await request.patch(`${api}/quotes/${quote.id}`, { headers, data: { status: "ready" } });
    expect(ready.ok()).toBe(true);
    const readyQuote = await ready.json();
    const proposal = await (await request.get(`${api}/proposals/${readyQuote.proposalShareToken}`)).json();
    expect(proposal.customerName).toBe("QA Field Customer Edited");
    expect((await request.get(`${api}/quotes/${quote.id}`, { headers: other })).status()).toBe(404);
    const exportData = { destination: "jobber", format: "csv", mapping: { propertyStreet1: "123 QA Test Street", taxable: "FALSE", taxConfirmed: true } };
    expect((await request.post(`${api}/quotes/${quote.id}/exports/jobber.csv`, { headers: other, data: exportData })).status()).toBe(404);
    const csv = await request.post(`${api}/quotes/${quote.id}/exports/jobber.csv`, { headers, data: exportData });
    expect(csv.ok()).toBe(true);
    const text = await csv.text();
    expect(text).toContain("field@example.com");
    expect(text).toContain("QA Field Customer Edited");
    await mkdir(process.env.AUDIT_OUTPUT!, { recursive: true });
    await writeFile(`${process.env.AUDIT_OUTPUT}/customer-workflow-jobber.csv`, text);
    await writeFile(`${process.env.AUDIT_OUTPUT}/customer-workflow.json`, JSON.stringify({
      status: "PASS", customerId, quoteId: quote.id, quoteTotal: quote.total, createEditSearchAndSelectUI: true,
      quoteAndProposalIdentity: true, duplicateEmail409: true, differentEmailSeparate: true,
      crossCompanyCustomerReadWrite404: true, crossCompanyPriceBookWrite404: items.length > 0,
      priceBookListsDisjoint: true, settingsQueryCannotSelectOtherCompany: true,
      crossCompanyQuoteAndExport404: true, productionTested: false,
    }, null, 2));
  } finally { await context.close(); }
});
