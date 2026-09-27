import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, companyMembersTable, companySettingsTable, priceBookItemsTable } from "@workspace/db";

// Explicit opt-in. Never points at production: the audit refuses non-local DBs.
const enabled = !!process.env.AUDIT_CATALOG;
const out = process.env.AUDIT_OUTPUT ?? "/home/user/workspace/pricecrew-audit-evidence";
const builders = ["new-house","custom","service-call","time-materials","addition","bathroom","ev-charger","kitchen","recessed-lighting","service-upgrade","panel-replacement"];
const changes: Record<string, Record<string,string>> = {
  "new-house":{"#nh-finished-sqft":"2200","#nh-outlets":"42","#nh-switches":"22"},
  addition:{"#addition-length":"22","#addition-width":"18","#addition-receptacles":"8"},
  bathroom:{"#bath-additionalReceptacles":"1","#bath-circuit-0-length":"45"},
  kitchen:{"#kitchen-electricRangeCircuits-quantity":"1","#kitchen-wallOvenCircuits-quantity":"1"},
  "recessed-lighting":{"#recessed-quantity":"8","#recessed-room-length":"22"},
  "service-call":{"#sc-visits":"2","#sc-crew-hours":"3"},
  "time-materials":{"#tm-crew-size":"2","#tm-crew-hours":"6"},
  "panel-replacement":{"#pr-crew-sz":"2","#pr-crew-hr":"11"},
  "service-upgrade":{"#su-crew-size":"2","#su-crew-hours":"18"},
  custom:{"#custom-hours":"10"},
};
test.describe("Electrical beta audit", () => {
  test.skip(!enabled, "Read-only catalog snapshot required for explicit audit run");
  for (const builder of builders) test(builder, async ({browser,request}) => {
    test.setTimeout(120_000);
    if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Audit requires a local disposable database");
    await mkdir(out,{recursive:true});
    const userId=`audit_${builder}_${randomUUID()}`, headers={"x-test-clerk-user-id":userId};
    const api="http://127.0.0.1:5080/api";
    await request.get(`${api}/settings`,{headers});
    const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId));
    const companyId=member!.companyId;
    await db.update(companySettingsTable).set({
      residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4,
      customLaborHours:8,customLaborSellRate:150,customLoadedLaborCost:65,customMaterialMarkup:.25,customTargetMargin:.4,
      timeMaterialsCrewSize:1,timeMaterialsHours:8,timeMaterialsLaborSellRate:165,timeMaterialsLoadedLaborCost:65,
      timeMaterialsMaterialMarkup:.25,timeMaterialsTargetMargin:.4,serviceCallVisitQuantity:1,serviceCallCrewSize:1,serviceCallHoursPerVisit:2,
      newHouseCrewSize:2,newHouseHoursPerPerson:80,serviceUpgradeCrewSize:2,serviceUpgradeHoursPerPerson:16,
      panelReplacementCrewSize:2,panelReplacementHoursPerPerson:10,
    }).where(eq(companySettingsTable.companyId,companyId));
    const catalog=JSON.parse(await readFile(process.env.AUDIT_CATALOG!,"utf8"));
    await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId,companyId));
    await db.insert(priceBookItemsTable).values(catalog.map((r:any)=>{
      const v:any={companyId};
      for(const [k,value] of Object.entries(r))if(k!=="id")v[k.replace(/_([a-z])/g,(_,s)=>s.toUpperCase())]=value;
      return v;
    }));
    const context=await browser.newContext({extraHTTPHeaders:headers,viewport:{width:1280,height:900}});
    await context.route("https://**/*",route=>{
      const clean={...route.request().headers()};delete clean["x-test-clerk-user-id"];
      return route.continue({headers:clean});
    });
    const page=await context.newPage();
    const errors:string[]=[],failedRequests:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
    page.on("response",r=>{if(r.status()>=400)failedRequests.push(`${r.status()} ${r.url().replace(/\?.*/,"")}`)});
    const evidence:any={builder,catalogRows:catalog.length,companyId,testUser:userId,errors,failedRequests,viewports:[]};
    try {
      const previewPromise=page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"),{timeout:15000});
      await page.goto(`/quotes/new/${builder}?draftScope=${userId}`);
      const response=await previewPromise;
      evidence.initialRequest=response.request().postDataJSON();
      evidence.initialPreview=await response.json();
      if(builder==="recessed-lighting")await page.getByText("Room Planning Guidance",{exact:false}).click();
      for(const [selector,value] of Object.entries(changes[builder]??{}))await page.locator(selector).fill(value);
      if(builder==="ev-charger"){
        const numeric=page.locator('input[type="number"]:visible');
        evidence.evNumericBefore=await numeric.evaluateAll(nodes=>nodes.slice(0,2).map((n:any)=>({id:n.id,value:n.value})));
        await numeric.nth(0).fill("2");
        await numeric.nth(1).fill("65");
      }
      const generate=page.getByRole("button",{name:/^Generate (?:.* )?Quote$|^Create Quote Snapshot$/}).last();
      const uiPreviews:any[]=[];
      page.on("response",async r=>{
        if(r.url().endsWith("/api/quotes/preview")&&r.ok())uiPreviews.push({request:r.request().postDataJSON(),result:await r.json()});
      });
      const customer=page.locator('input[id$="-customer"],#customerName').first();
      const project=page.locator('input[id$="-project"],#projectName').first();
      await customer.fill("QA Electrical Customer");
      await project.fill(`QA ${builder} realistic estimate`);
      const email=page.locator('input[id$="-email"],#customerEmail').first();
      if(await email.count())await email.fill("qa@example.com");
      // Wait for the actual edited values, not merely the existence of an older storage key.
      await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("realistic estimate"))).toBe(true);
      evidence.draftBefore=await page.evaluate(()=>({...localStorage}));
      await page.reload();
      await page.getByTestId("button-restore-quote-draft").click();
      await expect(project).toHaveValue(`QA ${builder} realistic estimate`);
      if(builder==="recessed-lighting")await page.getByText("Room Planning Guidance",{exact:false}).click();
      for(const [selector,value] of Object.entries(changes[builder]??{}))await expect(page.locator(selector)).toHaveValue(value);
      await expect.poll(()=>uiPreviews.length).toBeGreaterThan(0);
      const unfinished=page.getByRole("button",{name:"Generate Draft / Unfinished Quote",exact:true});
      if(await unfinished.count()===0)await expect(generate).toBeEnabled();
      evidence.editedUiRequest=uiPreviews.at(-1).request;
      evidence.editedUiPreview=uiPreviews.at(-1).result;
      evidence.draftRestored=true;
      // Use the actual browser-edited scope. Flexible samples are labor-only work.
      const payload=structuredClone(evidence.editedUiRequest);
      evidence.testRequest=payload;
      const calculated=await request.post(`${api}/quotes/preview`,{headers,data:payload});
      evidence.previewStatus=calculated.status();evidence.preview=await calculated.json();
      expect(calculated.ok()).toBe(true);
      const p=evidence.preview.pricing,round=(n:number)=>Math.round(n*100)/100;
      const material=round(evidence.preview.assembly.reduce((n:number,l:any)=>n+l.extendedCost,0));
      const internal=round(p.materialCost+p.laborCost);
      evidence.math={material,internal,grossProfit:round(p.finalSellingPrice-internal),
        grossMargin:p.finalSellingPrice?(p.finalSellingPrice-internal)/p.finalSellingPrice:0};
      expect(material).toBe(p.materialCost);
      expect(evidence.math.grossProfit).toBe(p.grossProfit);
      expect(evidence.math.grossMargin).toBeCloseTo(p.grossMargin,4);
      expect(round(p.finalLaborHours*65)).toBe(p.laborCost);
      expect(round(p.finalLaborHours*p.laborSellRate)).toBe(p.laborSellAmount);
      for(const width of [1280,768,375]){
        await page.setViewportSize({width,height:900});
        await page.evaluate("document.documentElement.classList.add('dark')");
        evidence.viewports.push({page:"builder",width,scrollWidth:await page.evaluate("document.documentElement.scrollWidth")});
        await page.screenshot({path:`${out}/${builder}-${width}.png`,fullPage:true});
      }
      // Save a draft, then explicitly test the customer-ready transition below.
      const data={...payload,customerName:"QA Electrical Customer",customerEmail:"qa@example.com",
        projectName:`QA ${builder} realistic estimate`,proposalDescription:`QA ${builder}: install the selected electrical work, test and clean up. O'Brien's "scope", with commas.\nSecond scope paragraph.`};
      const saveResponse=page.waitForResponse(r=>r.url().endsWith("/api/quotes")&&r.request().method()==="POST");
      if(await unfinished.count()&&await generate.isDisabled())await unfinished.click();
      else await generate.click();
      const ready=await saveResponse;
      evidence.readyAttemptStatus=ready.status();evidence.readyAttempt=await ready.json();
      let quote=evidence.readyAttempt;
      evidence.uiGenerated=ready.ok();
      if(!ready.ok()){
        const draft=await request.post(`${api}/quotes`,{headers,data:{...data,status:"draft"}});
        evidence.draftSaveStatus=draft.status();quote=await draft.json();
      }
      evidence.saved=quote;
      expect(quote.id).toBeTruthy();
      expect(quote.total).toBe(evidence.preview.pricing.finalSellingPrice);
      expect(quote.assembly).toEqual(evidence.preview.assembly);
      await page.setViewportSize({width:1280,height:900});
      await page.goto(`/quotes/${quote.id}`);
      await expect(page.getByRole("heading",{name:data.projectName,exact:true})).toBeVisible();
      evidence.savedText=await page.locator("body").innerText();
      await page.getByRole("button",{name:"Customer View",exact:true}).click();
      evidence.customerViewText=await page.getByTestId("customer-view-preview").innerText();
      expect(evidence.customerViewText).not.toMatch(/Gross Profit|Gross Margin|Loaded Labor Cost|\[object Object\]/);
      await page.getByRole("button",{name:"Internal View",exact:true}).click();
      for(const width of [768,375]){
        await page.setViewportSize({width,height:900});
        evidence.viewports.push({page:"saved",width,scrollWidth:await page.evaluate("document.documentElement.scrollWidth")});
        await page.screenshot({path:`${out}/${builder}-saved-${width}.png`,fullPage:true});
      }
      const readyCheck=await request.patch(`${api}/quotes/${quote.id}`,{headers,data:{status:"ready"}});
      evidence.markReadyStatus=readyCheck.status();
      evidence.markReadyResult=await readyCheck.json();
      if(readyCheck.ok()&&evidence.markReadyResult.proposalShareToken){
        await page.goto(`/proposals/${evidence.markReadyResult.proposalShareToken}`);
        await expect(page.getByTestId("button-download-customer-pdf")).toBeVisible();
        evidence.publicProposalText=await page.locator("body").innerText();
        const download=page.waitForEvent("download");
        await page.getByTestId("button-download-customer-pdf").click();
        await (await download).saveAs(`${out}/${builder}-proposal.pdf`);
        evidence.pdfGenerated=true;
      }
      const beforeDuplicate=await (await request.get(`${api}/quotes/${quote.id}`,{headers})).json();
      const duplicate=await request.post(`${api}/quotes/${quote.id}/duplicate`,{headers,data:{}});
      evidence.duplicateStatus=duplicate.status();evidence.duplicate=await duplicate.json();
      expect(duplicate.ok()).toBe(true);
      expect(evidence.duplicate.assembly).toEqual(quote.assembly);
      const after=await (await request.get(`${api}/quotes/${quote.id}`,{headers})).json();
      expect(after.pricing).toEqual(beforeDuplicate.pricing);
      expect(after.assembly).toEqual(beforeDuplicate.assembly);
      evidence.snapshotUnchanged=true;
      const exportData={destination:"jobber",format:"csv",mapping:{propertyStreet1:"123 QA Test Street",taxable:"FALSE",taxConfirmed:true}};
      const preflight=await request.post(`${api}/quotes/${quote.id}/exports/preflight`,{headers,data:exportData});
      evidence.exportPreflight=await preflight.json();
      if(evidence.exportPreflight.ready){
        const csv=await request.post(`${api}/quotes/${quote.id}/exports/jobber.csv`,{headers,data:exportData});
        evidence.exportStatus=csv.status();
        await writeFile(`${out}/${builder}-jobber.csv`,await csv.body());
      }
      evidence.completed=true;
    } catch(error){
      evidence.failure=String(error);
      throw error;
    } finally {
      await writeFile(`${out}/${builder}.json`,JSON.stringify(evidence,null,2));
      await context.close();
    }
  });
});
