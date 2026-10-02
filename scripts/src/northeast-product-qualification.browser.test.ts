import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {eq} from "drizzle-orm";
import {db,companyMembersTable,companySettingsTable,companiesTable,priceBookItemsTable,priceBookImportsTable,quotesTable,customersTable} from "@workspace/db";

test("exact Northeast product import, mapping, refreshed estimate and immutable historical quotes",async({browser,request},info)=>{
 if(!["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))throw Error("Disposable local database only");
 const api="http://127.0.0.1:5080/api",headers={"x-test-clerk-user-id":`northeast_${randomUUID()}`};
 await request.get(`${api}/settings`,{headers});
 const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,headers["x-test-clerk-user-id"]));
 const companyId=member!.companyId;
 const context=await browser.newContext({extraHTTPHeaders:headers});
 await context.route("https://**/*",r=>{const h={...r.request().headers()};delete h["x-test-clerk-user-id"];return r.continue({headers:h})});
 try{
  const csv=await readFile(new URL("./northeast-products-20261002.csv",import.meta.url),"utf8");
  const fixtures=JSON.parse(await readFile(new URL("./customer-scope-fixtures.json",import.meta.url),"utf8"));
  const ev=fixtures.find((f:any)=>f.module==="EV_CHARGER");
  const payload={...ev,customerName:"Local catalog qualification",projectName:"Local exact Northeast products",
   jobInputs:{...ev.jobInputs,connection:"NEMA 14-50 Receptacle",cableType:"6/3 NM-B",wiringMethod:"Romex (NM-B)",permit:"Not Required"}};
  const beforeResponse=await request.post(`${api}/quotes`,{headers,data:payload});
  expect(beforeResponse.status()).toBe(201);const historical=await beforeResponse.json();
  const page=await context.newPage();await page.goto("/price-book");
  await page.getByTestId("northeast-price-file").setInputFiles({name:"contractor-confirmed-products.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
  const previewResponse=page.waitForResponse(r=>r.url().endsWith("/price-book/imports/preview"));
  await page.getByTestId("preview-price-book-import").click();
  const review=await(await previewResponse).json();
  expect(review.rows).toHaveLength(3);
  expect(review.rows.every((r:any)=>r.action==="insert")).toBe(true);
  for(const row of review.rows)await page.getByRole("checkbox",{name:`Select CSV row ${row.rowNumber}`,exact:true}).check();
  const applyResponse=page.waitForResponse(r=>r.url().endsWith(`/price-book/imports/${review.id}/apply`));
  await page.getByTestId("apply-price-book-import").click();
  const applied=await(await applyResponse).json();
  expect(applied.rows.filter((r:any)=>r.status==="applied")).toHaveLength(3);
  const getRows=async()=>await(await request.get(`${api}/price-book`,{headers})).json();
  const all=await getRows();
  const products=["3894WREV","RCD11W","TP26-W"].map(part=>all.find((r:any)=>r.manufacturerPartNumber===part));
  expect(products.map((r:any)=>r.unitCost)).toEqual([57.32,21.48,.4683]);
  expect(products[2].supplierCost).toBe(46.83);expect(products[2].supplierUom).toBe("C");expect(products[2].supplierUnitQuantity).toBe(100);
  for(const [i,key,source] of [
   [0,"NEMA 14-50 receptacle","2026-10-02 manufacturer: https://www.legrand.us/wiring-devices/outlets-and-receptacles/power-outlets/50a-weather-resistant-electrical-outlet-for-ev-chargers/p/ps-3894wrev"],
   [1,"Addition stacked single-pole/single-pole control","2026-10-02 RCD11W device only; TP26-W pairing pending. https://www.legrand.us/wiring-devices/radiant-collection/switches/radiant-two-single-pole-switches-white/p/rcd11w"],
  ] as const){
   await page.locator("#component-request").selectOption(key);
   await page.locator("#component-product").selectOption(String(products[i].id));
   await page.locator("#component-source").fill(source);
   if(i===1)await page.locator("#component-opening").selectOption("decorator");
   await page.locator("#component-confirm").check();
   await page.getByRole("button",{name:"Save component mapping",exact:true}).click();
   await expect(page.getByTestId("component-status")).toHaveText("Verified / Priced");
  }
  const mapped=await getRows();
  expect(mapped.find((r:any)=>r.id===products[2].id).materialPreferences).toEqual([]);
  await page.locator("#component-request").selectOption("Addition stacked control matching white wall plate");
  await page.locator("#component-product").selectOption(String(products[2].id));
  await page.locator("#component-source").fill("TP26-W identity only, not approved for RCD11W");
  await page.locator("#component-compatible-control").selectOption(String(products[1].id));
  await page.locator("#component-confirm").check();
  await expect(page.getByRole("button",{name:"Save component mapping",exact:true})).toBeDisabled();
  await expect(page.locator("#component-pair-source")).toHaveValue("");
  await expect(page.getByTestId("component-status")).toHaveText("Missing Catalog Item");
  await page.screenshot({path:info.outputPath("exact-products-local-mapping.png"),fullPage:true});
  const after=await(await request.post(`${api}/quotes/preview`,{headers,data:payload})).json();
  const receptacle=after.assembly.find((r:any)=>r.id==="receptacle");
  expect(receptacle.materialSnapshot.catalogId).toBe(products[0].id);expect(receptacle.unitCost).toBe(57.32);
  const saved=await(await request.post(`${api}/quotes`,{headers,data:payload})).json();
  expect(saved.assembly).toEqual(after.assembly);expect(saved.pricing).toEqual(after.pricing);
  expect((await request.patch(`${api}/quotes/${saved.id}`,{headers,data:{status:"ready"}})).status()).toBe(409);
  const updateReview=await(await request.post(`${api}/price-book/imports/preview`,{headers,data:{
   fileName:"hypothetical-future-price-local-only.csv",csv:csv.replace(",57.32,1,",",58.32,1,").replaceAll("2026-10-02","2026-10-03")
  }})).json();
  expect(updateReview.rows.every((r:any)=>r.action!=="insert")).toBe(true);
  const changed=updateReview.rows.find((r:any)=>r.incoming.manufacturerPartNumber==="3894WREV");
  expect((await request.post(`${api}/price-book/imports/${updateReview.id}/apply`,{headers,data:{selectedRows:[changed.rowNumber]}})).ok()).toBe(true);
  const fresh=await(await request.post(`${api}/quotes/preview`,{headers,data:payload})).json();
  expect(fresh.assembly.find((l:any)=>l.id==="receptacle").unitCost).toBe(58.32);
  for(const original of [historical,saved]){
   const reopened=await(await request.get(`${api}/quotes/${original.id}`,{headers})).json();
   expect(reopened.assembly).toEqual(original.assembly);expect(reopened.pricing).toEqual(original.pricing);
   expect(reopened.customerScope).toEqual(original.customerScope);
  }
  const finalRows=await getRows();expect(finalRows.filter((r:any)=>r.supplierSku==="163554")).toHaveLength(1);
 }finally{
  await context.close();
  for(const table of [quotesTable,customersTable,priceBookImportsTable,priceBookItemsTable,companySettingsTable,companyMembersTable])await db.delete(table).where(eq(table.companyId,companyId));
  await db.delete(companiesTable).where(eq(companiesTable.id,companyId));
 }
});
