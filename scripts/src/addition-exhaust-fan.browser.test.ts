import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import { db, companyMembersTable, quotesTable, customersTable, priceBookItemsTable, companySettingsTable, companiesTable } from "@workspace/db";

const requireApi = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const {PDFParse} = requireApi("pdf-parse");

test("Addition bathroom exhaust: supplied precedence, measured wiring, responsive draft/save/revise/proposal/PDF", async ({browser,request}, info) => {
  if (!["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))
    throw new Error("Exhaust regression requires a disposable local database");
  const api="http://127.0.0.1:5080/api", userId=`exhaust_${randomUUID()}`, headers={"x-test-clerk-user-id":userId};
  await request.get(`${api}/settings`,{headers});
  const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId));
  const companyId=member!.companyId;
  const context=await browser.newContext({extraHTTPHeaders:headers,viewport:{width:1440,height:1000}});
  await context.route("https://**/*",route=>{
    const clean={...route.request().headers()};delete clean["x-test-clerk-user-id"];
    return route.continue({headers:clean});
  });
  try {
    await db.update(companySettingsTable).set({residentialLaborSellRate:150,loadedLaborCost:65,
      materialMarkup:.25,targetMargin:.4}).where(eq(companySettingsTable.companyId,companyId));
    await db.insert(priceBookItemsTable).values([
      ["Panasonic FV-0511VF1 exhaust fan",120,"Ventilation","ea"],
      ["Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",2,"Controls","ea"],
      ["Pass & Seymour S1-18-W 1-gang box — SKU 18134",3,"Rough-in","ea"],
      ["Legrand radiant RWP26WCC10 1-gang screwless wall plate",4,"Trim","ea"],
      ["12/2 NM-B cable",.6,"Conductor","ft"],
      ["fan timer switch",25,"Controls","ea"],
    ].map(([item,unitCost,category,unit])=>({companyId,item:String(item),unitCost:Number(unitCost),
      category:String(category),unit:String(unit),supplier:"Synthetic QA",sourceDate:"2026-09-27",isDefault:false})));
    await db.insert(priceBookItemsTable).values({companyId,category:"Protection",
      item:"Siemens 20A 1-pole AFCI breaker",unit:"ea",unitCost:50,manufacturer:"Siemens",
      amperage:20,poleCount:1,protectionType:"AFCI",supplier:"Synthetic QA",sourceDate:"2026-09-27",isDefault:false});
    const page=await context.newPage();
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(`/quotes/new/addition?draftScope=${userId}`);
    await expect(page.locator("#addition-exhaust-quantity")).toHaveValue("0");
    await expect(page.locator("#addition-exhaust-wire")).toHaveCount(0);
    await page.locator("#addition-customer").fill("QA Exhaust Customer");
    await page.locator("#addition-project").fill("QA Bathroom Addition");
    for(const id of ["receptacles","switches","dimmers","recessedLights","ceilingFans"])
      await page.locator(`#addition-${id}`).fill("0");
    await page.locator("#addition-exhaust-quantity").fill("2");
    // New estimates require an explicit control selection; preserve this fixture's
    // established single-pole scope and its unchanged 17-hour assertion.
    await page.locator("#addition-exhaust-control").selectOption("Standard switch");
    await expect(page.getByText(/Addition exhaust-fan wiring is unresolved:/)).toBeVisible();
    await page.locator("#addition-exhaust-wire").fill("30");
    await page.getByText("Advanced exhaust-fan equipment cost",{exact:true}).click();
    await page.locator("#addition-exhaust-cost").fill("999");
    const suppliedPreview=page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview")&&
      r.request().postDataJSON().jobInputs?.bathroomExhaust?.customerSupplied===true);
    await page.locator("#addition-exhaust-supply").selectOption("customer");
    const preview=await (await suppliedPreview).json();
    const fan=preview.assembly.find((l:any)=>l.id==="addition-exhaust-fans");
    expect(fan.unitCost).toBe(0);
    expect(fan.resolutionStatus).toBe("CUSTOMER_SUPPLIED");
    expect(preview.pricing.finalLaborHours).toBe(17); // Includes unchanged 2.5 hours for the existing circuit.
    expect(preview.assembly.find((l:any)=>l.id==="addition-circuit-1-cable").quantity).toBe(100);
    await expect(page.locator("#addition-exhaust-cost")).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>Object.values(localStorage).some(raw=>{
      try {const text=JSON.stringify(JSON.parse(raw));return text.includes("QA Bathroom Addition")
        &&text.includes('"wiringLength":30')&&text.includes('"materialCostOverride":999')&&text.includes('"customerSupplied":true');}
      catch{return false;}
    }))).toBe(true);
    await page.reload();
    await page.getByTestId("button-restore-quote-draft").click();
    await expect(page.locator("#addition-exhaust-quantity")).toHaveValue("2");
    await expect(page.locator("#addition-exhaust-supply")).toHaveValue("customer");
    await expect(page.locator("#addition-exhaust-wire")).toHaveValue("30");
    for(const [name,width] of [["desktop",1440],["tablet",834],["mobile",390]] as const) {
      await page.setViewportSize({width,height:1000});
      await page.locator("#addition-bathroom-heading").scrollIntoViewIfNeeded();
      expect(await page.evaluate(()=>{
        const browser=globalThis as unknown as {document:{documentElement:{scrollWidth:number}};innerWidth:number};
        return browser.document.documentElement.scrollWidth<=browser.innerWidth;
      })).toBe(true);
      await page.screenshot({path:info.outputPath(`addition-exhaust-${name}.png`)});
      await expect(page.locator("#addition-exhaust-supply")).toBeVisible();
    }
    await page.setViewportSize({width:1440,height:1000});
    const created=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate Addition Quote",exact:true}).click();
    const response=await created;
    expect(response.ok()).toBe(true);
    const saved=await response.json();
    expect(saved.pricing).toEqual(preview.pricing);
    expect(saved.assembly).toEqual(preview.assembly);
    const ready=await request.patch(`${api}/quotes/${saved.id}`,{headers,data:{status:"ready"}});
    expect(ready.status()).toBe(200);
    const readySnapshot=await ready.json();
    expect(readySnapshot.assembly).toEqual(saved.assembly);
    expect(readySnapshot.total).toBe(saved.total);
    await page.reload();
    await page.getByRole("button",{name:"Customer Proposal",exact:true}).click();
    const download=page.waitForEvent("download");
    await page.getByTestId("button-download-customer-pdf").click();
    const file=info.outputPath("addition-exhaust-proposal.pdf");
    await (await download).saveAs(file);
    const parser=new PDFParse({data:new Uint8Array(await readFile(file))});
    const pdf=await parser.getText();await parser.destroy();
    expect(pdf.text).toContain(saved.total.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
    expect(pdf.text).not.toMatch(/Gross Profit|Gross Margin|Loaded Labor|unitCost|999/);
    await page.goto(`/quotes/${saved.id}`);
    await page.getByTestId("button-duplicate-quote").click();
    await expect(page.locator("#addition-exhaust-supply")).toHaveValue("customer");
    await page.locator("#addition-exhaust-supply").selectOption("contractor");
    await page.getByText("Advanced exhaust-fan equipment cost",{exact:true}).click();
    await expect(page.locator("#addition-exhaust-cost")).toHaveValue("999");
    await page.locator("#addition-exhaust-cost").fill("");
    await page.locator("#addition-exhaust-control").selectOption("Timer switch");
    const revisedResponse=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Generate Addition Quote",exact:true}).click();
    const revised=await (await revisedResponse).json();
    expect(revised.id).not.toBe(saved.id);
    expect(revised.assembly.find((l:any)=>l.id==="addition-exhaust-fans").extendedCost).toBe(240);
    expect(revised.assembly.find((l:any)=>l.id==="addition-exhaust-controls").extendedCost).toBe(50);
    expect(revised.pricing.finalLaborHours).toBe(17.5);
    // Required wire price removed only from this QA company: new quotes block, saved ones remain immutable.
    const [wire]=await db.select().from(priceBookItemsTable).where(eq(priceBookItemsTable.companyId,companyId))
      .then(rows=>rows.filter(r=>r.item==="12/2 NM-B cable"));
    await db.update(priceBookItemsTable).set({unitCost:0}).where(eq(priceBookItemsTable.id,wire!.id));
    const reopened=await (await request.get(`${api}/quotes/${saved.id}`,{headers})).json();
    expect(reopened.pricing).toEqual(readySnapshot.pricing);
    expect(reopened.assembly).toEqual(saved.assembly);
    const unresolved=await request.post(`${api}/quotes`,{headers,data:{module:"ADDITION",jobInputs:revised.jobInputs,
      customerName:"QA Exhaust Customer",projectName:"QA missing wire",proposalDescription:"Exhaust electrical scope"}});
    expect(unresolved.ok()).toBe(true);
    const unfinished=await unresolved.json();
    expect((await request.patch(`${api}/quotes/${unfinished.id}`,{headers,data:{status:"ready"}})).status()).toBe(409);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    for(const table of [quotesTable,customersTable,priceBookItemsTable,companySettingsTable,companyMembersTable])
      await db.delete(table).where(eq(table.companyId,companyId));
    await db.delete(companiesTable).where(eq(companiesTable.id,companyId));
  }
});
