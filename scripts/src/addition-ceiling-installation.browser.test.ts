import {expect,test} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {db,companyMembersTable,companySettingsTable,priceBookItemsTable,quotesTable,customersTable,companiesTable} from "@workspace/db";

for(const mode of ["new","reuse"] as const) test(`Addition ceiling fan ${mode}: confirmed scope, draft, Ready, proposal and immutable revision`,async({browser,request},info)=>{
  if(!["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error("Local database only");
  const api="http://127.0.0.1:5080/api",userId=`ceiling_${randomUUID()}`,headers={"x-test-clerk-user-id":userId};
  await request.get(`${api}/settings`,{headers});
  const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId));
  const companyId=member!.companyId;
  const context=await browser.newContext({extraHTTPHeaders:headers});
  await context.route("https://**/*",r=>{const h={...r.request().headers()};delete h["x-test-clerk-user-id"];return r.continue({headers:h})});
  try{
    await db.update(companySettingsTable).set({residentialLaborSellRate:150,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4}).where(eq(companySettingsTable.companyId,companyId));
    const [support]=await db.insert(priceBookItemsTable).values({companyId,item:"QA fan-rated support complete kit",category:"Rough-in",unit:"ea",unitCost:40,
      manufacturer:"QA",manufacturerPartNumber:"SUPPORT-1",supplier:"Synthetic",sourceDate:"2026-09-28",isDefault:false}).returning();
    await db.insert(priceBookItemsTable).values([
      ["Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",2,"Controls","ea","Pass & Seymour","TM870-W"],
      ["Pass & Seymour S1-18-W 1-gang box — SKU 18134",3,"Rough-in","ea","",""],
      ["Legrand radiant RWP26WCC10 1-gang screwless wall plate",4,"Trim","ea","",""],
      ["14/3 NM-B cable",.8,"Conductor","ft","",""],["12/2 NM-B cable",.6,"Conductor","ft","",""],
    ].map(([item,unitCost,category,unit,manufacturer,manufacturerPartNumber])=>({companyId,item:String(item),unitCost:Number(unitCost),category:String(category),
      unit:String(unit),manufacturer:String(manufacturer),manufacturerPartNumber:String(manufacturerPartNumber),supplier:"Synthetic",sourceDate:"2026-09-28",isDefault:false})));
    await db.insert(priceBookItemsTable).values({companyId,item:"Siemens 20A AFCI breaker",category:"Protection",unit:"ea",unitCost:50,manufacturer:"Siemens",
      amperage:20,poleCount:1,protectionType:"AFCI",supplier:"Synthetic",sourceDate:"2026-09-28",isDefault:false});
    const page=await context.newPage();
    await page.goto(`/quotes/new/addition?draftScope=${userId}`);
    await page.locator("#addition-customer").fill("QA Fan Customer");
    await page.locator("#addition-project").fill(`QA ${mode} ceiling fans`);
    for(const key of ["receptacles","switches","dimmers","recessedLights"])await page.locator(`#addition-${key}`).fill("0");
    await page.locator("#addition-ceilingFans").fill("2");
    await page.locator("#addition-fan-location").selectOption(mode);
    if(mode==="new"){
      await page.locator("#addition-fan-support").selectOption(String(support!.id));
      await page.locator("#addition-fan-wire").fill("30");
      await page.locator("#addition-fan-cable").selectOption("14/3 NM-B");
    }
    await page.locator("#addition-fan-support-verified").check();
    const previewPromise=page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview")&&r.request().postDataJSON().jobInputs.ceilingFanInstallation?.wiringVerified===true);
    await page.locator("#addition-fan-wiring-verified").check();
    const preview=await(await previewPromise).json();
    expect(preview.pricing.pricingWarnings.filter((w:any)=>w.severity==="error")).toEqual([]);
    await expect.poll(()=>page.evaluate(()=>Object.values(localStorage).some(raw=>raw.includes('"wiringVerified":true')&&raw.includes('"verifiedFanQuantity":2')))).toBe(true);
    await page.reload();await page.getByTestId("button-restore-quote-draft").click();
    await expect(page.locator("#addition-fan-location")).toHaveValue(mode);
    await expect(page.locator("#addition-fan-support-verified")).toBeChecked();
    await expect(page.locator("#addition-fan-wiring-verified")).toBeChecked();
    const save=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate Addition Quote",exact:true}).click();
    const saved=await(await save).json();
    expect(saved.assembly).toEqual(preview.assembly);expect(saved.pricing).toEqual(preview.pricing);
    expect(saved.assembly.find((l:any)=>l.id==="addition-ceiling-fans").extendedCost).toBe(0);
    expect(saved.assembly.some((l:any)=>l.id==="addition-fan-support")).toBe(mode==="new");
    const p=saved.pricing,round=(n:number)=>Math.round(n*100)/100;
    expect(p.materialCost).toBe(round(saved.assembly.reduce((s:number,l:any)=>s+l.extendedCost,0)));
    expect(p.laborCost).toBe(round(p.finalLaborHours*65));
    expect(p.laborSellAmount).toBe(round(p.finalLaborHours*150));
    expect(p.grossProfit).toBe(round(p.finalSellingPrice-p.materialCost-p.laborCost));
    expect(p.grossMargin).toBeCloseTo(p.grossProfit/p.finalSellingPrice,4);
    const ready=await request.patch(`${api}/quotes/${saved.id}`,{headers,data:{status:"ready"}});
    expect(ready.status()).toBe(200);const readySnapshot=await ready.json();
    await page.reload();await page.getByRole("button",{name:"Customer View",exact:true}).click();
    await expect(page.getByTestId("customer-view-preview")).toContainText("QA");
    await page.getByRole("button",{name:"Customer Proposal",exact:true}).click();
    await expect(page.getByTestId("button-download-customer-pdf")).toBeEnabled();
    const download=page.waitForEvent("download");await page.getByTestId("button-download-customer-pdf").click();
    await(await download).saveAs(info.outputPath(`ceiling-${mode}.pdf`));
    await page.goto(`/quotes/${saved.id}`);await page.getByTestId("button-duplicate-quote").click();
    await expect(page.locator("#addition-fan-location")).toHaveValue(mode);
    await expect(page.locator("#addition-fan-wiring-verified")).toBeChecked();
    await page.locator("#addition-fan-wiring-verified").uncheck();
    const incomplete=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate Addition Quote",exact:true}).click();
    const revised=await(await incomplete).json();
    expect(revised.id).not.toBe(saved.id);
    expect((await request.patch(`${api}/quotes/${revised.id}`,{headers,data:{status:"ready"}})).status()).toBe(409);
    await db.update(priceBookItemsTable).set({unitCost:999}).where(eq(priceBookItemsTable.companyId,companyId));
    const reopened=await(await request.get(`${api}/quotes/${saved.id}`,{headers})).json();
    expect(reopened.pricing).toEqual(readySnapshot.pricing);expect(reopened.assembly).toEqual(saved.assembly);
  } finally {
    await context.close();
    for(const table of [quotesTable,customersTable,priceBookItemsTable,companySettingsTable,companyMembersTable])await db.delete(table).where(eq(table.companyId,companyId));
    await db.delete(companiesTable).where(eq(companiesTable.id,companyId));
  }
});
