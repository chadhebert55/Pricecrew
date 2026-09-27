import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, companyMembersTable, quotesTable, customersTable, priceBookItemsTable, companySettingsTable, companiesTable } from "@workspace/db";

test("Addition verified controls and supplied-fan scope survive draft, save, customer preview, and revision", async ({browser,request}, info) => {
  test.setTimeout(120_000);
  if (!["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))
    throw new Error("Addition regression requires a disposable local database");
  const api="http://127.0.0.1:5080/api", userId=`addition_identity_${randomUUID()}`;
  const headers={"x-test-clerk-user-id":userId};
  await request.get(`${api}/settings`,{headers});
  const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId));
  const companyId=member!.companyId;
  const context=await browser.newContext({extraHTTPHeaders:headers});
  await context.route("https://**/*",route=>{
    const clean={...route.request().headers()};delete clean["x-test-clerk-user-id"];
    return route.continue({headers:clean});
  });
  try {
    await db.insert(priceBookItemsTable).values([
      {companyId,category:"Controls",item:"Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",unit:"ea",unitCost:1.85,
        manufacturer:"Pass & Seymour",manufacturerPartNumber:"TM870-W",supplierSku:"3211",supplier:"QA synthetic supplier",sourceDate:"2026-09-27",isDefault:false},
      {companyId,category:"Controls",item:"Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",unit:"ea",unitCost:30.28,
        manufacturer:"Lutron",manufacturerPartNumber:"DVCL-153P-WH",supplierSku:"607393",supplier:"QA synthetic supplier",sourceDate:"2026-09-27",isDefault:false},
    ]);
    const page=await context.newPage();
    await page.goto(`/quotes/new/addition?draftScope=${userId}`);
    await page.locator("#addition-customer").fill("QA Addition identity customer");
    await page.locator("#addition-project").fill("QA Addition identity and supplied fan");
    await page.locator("#addition-switches").fill("3");
    await page.locator("#addition-dimmers").fill("2");
    await page.locator("#addition-ceilingFans").fill("2");
    await expect.poll(()=>page.evaluate(()=>Object.values(localStorage).some(raw=>{
      try {const text=JSON.stringify(JSON.parse(raw));return text.includes("QA Addition identity and supplied fan")
        && text.includes('"switches":3') && text.includes('"dimmers":2') && text.includes('"ceilingFans":2');}
      catch {return false;}
    }))).toBe(true);
    await page.reload();
    await page.getByTestId("button-restore-quote-draft").click();
    await expect(page.locator("#addition-switches")).toHaveValue("3");
    await expect(page.locator("#addition-dimmers")).toHaveValue("2");
    await expect(page.locator("#addition-ceilingFans")).toHaveValue("2");
    await expect(page.getByText(/Fan purchase cost is excluded; installation labor remains/)).toBeVisible();
    const created=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate Addition Quote",exact:true}).click();
    const response=await created;
    expect(response.ok()).toBe(true);
    const saved=await response.json();
    const line=(id:string)=>saved.assembly.find((l:any)=>l.id===id);
    expect(line("addition-switches").unitCost).toBe(1.85);
    expect(line("addition-switches").quantity).toBe(3);
    expect(line("addition-dimmers").materialSnapshot.supplierSku).toBe("607393");
    expect(line("addition-ceiling-fans").extendedCost).toBe(0);
    expect(line("addition-ceiling-fans").resolutionStatus).toBe("CUSTOMER_SUPPLIED");
    expect(saved.pricing.pricingWarnings).toContainEqual(expect.objectContaining({
      code:"ADDITION_SUPPLIED_FAN_SCOPE_REVIEW",category:"field-verification",severity:"error",
    }));
    const ready=await request.patch(`${api}/quotes/${saved.id}`,{headers,data:{status:"ready"}});
    expect(ready.status()).toBe(409);
    await expect(page).toHaveURL(new RegExp(`/quotes/${saved.id}$`));
    await expect(page.getByRole("button",{name:"Customer Proposal",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"Customer View",exact:true}).click();
    const customerPreview=page.getByTestId("customer-view-preview");
    await expect(customerPreview).toContainText("QA Addition identity and supplied fan");
    await expect(customerPreview).not.toContainText("ADDITION_SUPPLIED_FAN_SCOPE_REVIEW");
    await page.screenshot({path:info.outputPath("addition-customer-preview.png"),fullPage:true});
    await page.getByTestId("button-duplicate-quote").click();
    await expect(page).toHaveURL(new RegExp(`/quotes/new/addition\\?reviseFrom=${saved.id}$`));
    await expect(page.locator("#addition-switches")).toHaveValue("3");
    await expect(page.locator("#addition-dimmers")).toHaveValue("2");
    await expect(page.locator("#addition-ceilingFans")).toHaveValue("2");
    const revisedResponse=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate Addition Quote",exact:true}).click();
    const revised=await (await revisedResponse).json();
    expect(revised.id).not.toBe(saved.id);
    expect(revised.assembly).toEqual(saved.assembly);
    expect(revised.total).toBe(saved.total);
    // Change only this disposable QA company's catalog, then prove saved values
    // are immutable rather than being looked up again when a quote is opened.
    await db.update(priceBookItemsTable).set({unitCost:999}).where(eq(priceBookItemsTable.companyId,companyId));
    const reopened=await (await request.get(`${api}/quotes/${saved.id}`,{headers})).json();
    expect(reopened.pricing).toEqual(saved.pricing);
    expect(reopened.assembly).toEqual(saved.assembly);
    expect(reopened.total).toBe(saved.total);
  } finally {
    await context.close();
    for(const table of [quotesTable,customersTable,priceBookItemsTable,companySettingsTable,companyMembersTable])
      await db.delete(table).where(eq(table.companyId,companyId));
    await db.delete(companiesTable).where(eq(companiesTable.id,companyId));
  }
});
