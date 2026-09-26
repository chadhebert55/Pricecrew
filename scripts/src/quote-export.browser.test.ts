import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, companiesTable, companyMembersTable, customersTable, quotesTable, companySettingsTable, priceBookItemsTable } from "@workspace/db";

for (const mode of ["panel", "recessed", "large takeoff"]) test(`saved quote cleanup / Jobber ${mode}`, async ({ browser }) => {
  const userId=`export_${randomUUID()}`;
  const [company]=await db.insert(companiesTable).values({name:"Export QA"}).returning();
  await db.insert(companyMembersTable).values({userId,companyId:company.id,role:"owner"});
  const [customer]=await db.insert(customersTable).values({companyId:company.id,name:"Ada Lovelace",email:"ada@example.com"}).returning();
  const [quote]=await db.insert(quotesTable).values({
    companyId:company.id,customerId:customer.id,quoteNumber:"TEST-EXPORT",customerName:customer.name,customerEmail:customer.email,
    projectName:"Electrical installation",module:mode==="recessed"?"RECESSED_LIGHTING":"PANEL_REPLACEMENT",status:"ready",
    jobInputs:{notes:"PRIVATE ESTIMATOR NOTE",circuitConfigurationVersion:2,lightingGroups:[{key:"one",quantity:6,control:"Dimmer"}]} as never,
    assembly:Array.from({length:mode==="large takeoff"?30:1},(_,i)=>({id:`material-${i}`,category:"Material",description:`Private supplier ${i}`,quantity:1,unit:"ea",unitCost:10,extendedCost:10,source:"Catalog"})),
    pricing:{materialCost:300,laborCost:500,materialMarkup:0.25,calculatedSellingPrice:2000,finalSellingPrice:2345.67,
      sellingPriceOverride:2345.67,laborOverride:null,grossProfit:1545.67,grossMargin:1545.67/2345.67,pricingWarnings:[]},
    proposalDescription:"Install O'Brien's \"lights\",\nthen test.",total:2345.67,margin:1545.67/2345.67,
  }).returning();
  const context=await browser.newContext({extraHTTPHeaders:{"x-test-clerk-user-id":userId}});
  try {
    const page=await context.newPage();await page.goto(`/quotes/${quote.id}`);
    await expect(page.getByRole("heading",{name:"Electrical installation",exact:true})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Builder Inputs Record"})).toBeHidden();
    await expect(page.getByTestId("quote-proposal-decision")).toHaveCount(0);
    await expect(page.getByText("[object Object]",{exact:false})).toHaveCount(0);
    await page.getByText("Advanced → Builder Inputs & Calculation Details",{exact:true}).click();
    await expect(page.getByText("control: Dimmer",{exact:false})).toBeVisible();
    await page.getByText("Advanced → Builder Inputs & Calculation Details",{exact:true}).click();
    await page.getByRole("button",{name:"Customer View",exact:true}).click();
    const customerView=page.getByTestId("customer-view-preview");
    await expect(customerView).toBeVisible();
    await expect(customerView).not.toContainText("Gross Profit");
    await expect(customerView).not.toContainText("PRIVATE ESTIMATOR");
    await expect(customerView).not.toContainText("Private supplier");
    await page.getByRole("button",{name:"Internal View",exact:true}).click();
    const button=page.getByTestId("button-download-jobber-csv");
    await expect(button).toBeDisabled();
    await page.getByText("Advanced Jobber Mapping",{exact:true}).click();
    await page.getByLabel("Property Street 1",{exact:true}).fill("123 Main St");
    await page.getByLabel("Taxable service?",{exact:true}).selectOption("FALSE");
    await page.getByText("I verified the tax treatment for this job.",{exact:true}).click();
    await expect(button).toBeEnabled();
    await page.getByLabel("Jobber Client ID",{exact:true}).fill("CLIENT-123");
    await page.getByLabel("Jobber Property ID",{exact:true}).fill("PROPERTY-456");
    await page.getByRole("button",{name:"Save mapping to customer / primary property"}).click();
    await expect.poll(async()=> (await db.select().from(customersTable).where(eq(customersTable.id,customer.id)))[0].integrationMapping.jobberClientId).toBe("CLIENT-123");
    await expect(button).toBeEnabled();
    const downloaded=page.waitForEvent("download");await button.click();
    const csv=await readFile((await (await downloaded).path())!, "utf8");
    expect(csv).toContain('"CLIENT-123"');expect(csv).toContain('"PROPERTY-456"');
    expect(csv).toContain('"2345.67"');expect(csv).toContain('"Draft"');
    expect(csv).not.toContain("Private supplier");expect(csv).not.toContain("PRIVATE ESTIMATOR");
    const [after]=await db.select().from(quotesTable).where(eq(quotesTable.id,quote.id));
    expect(after.pricing).toEqual(quote.pricing);expect(after.total).toEqual(quote.total);expect(after.assembly).toEqual(quote.assembly);
    await page.reload();
    await page.getByText("Advanced Jobber Mapping",{exact:true}).click();
    await expect(page.getByLabel("Jobber Client ID",{exact:true})).toHaveValue("CLIENT-123");
    await expect(page.getByLabel("Jobber Property ID",{exact:true})).toHaveValue("PROPERTY-456");
    await page.getByLabel("Property Street 1",{exact:true}).fill("Different property");
    await expect(page.getByLabel("Jobber Property ID",{exact:true})).toHaveValue("");
    // Server also reuses IDs when caller sends only tax review.
    const preflight=await context.request.post(`http://127.0.0.1:5080/api/quotes/${quote.id}/exports/preflight`,
      {data:{destination:"jobber",format:"csv",mapping:{taxable:"FALSE",taxConfirmed:true}}});
    expect(await preflight.json()).toMatchObject({ready:true,lineItemCount:1});
    await page.getByText("Advanced Jobber Mapping",{exact:true}).click();
    for (const width of [375,768,1280]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate('document.documentElement.classList.add("dark")');
      await page.screenshot({path:test.info().outputPath(`saved-quote-${width}.png`),fullPage:true});
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    await db.update(quotesTable).set({status:"draft",assembly:[...quote.assembly,{id:"missing",category:"Material",description:"Missing ground bar",quantity:1,unit:"ea",unitCost:0,extendedCost:0,source:"Unresolved"}]}).where(eq(quotesTable.id,quote.id));
    await page.reload();await expect(page.getByRole("button",{name:"Mark Ready",exact:true})).toBeDisabled();
    await expect(page.getByTestId("button-download-jobber-csv")).toBeDisabled();
  } finally {
    await context.close();
    await db.delete(quotesTable).where(eq(quotesTable.companyId,company.id));
    await db.delete(customersTable).where(eq(customersTable.companyId,company.id));
    await db.delete(companyMembersTable).where(eq(companyMembersTable.companyId,company.id));
    await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId,company.id));
    await db.delete(companySettingsTable).where(eq(companySettingsTable.companyId,company.id));
    await db.delete(companiesTable).where(eq(companiesTable.id,company.id));
  }
});
