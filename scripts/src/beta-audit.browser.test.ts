import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, companyMembersTable, companySettingsTable, priceBookItemsTable } from "@workspace/db";

// Explicit opt-in. Never points at production: the audit refuses non-local DBs.
const enabled = !!process.env.AUDIT_CATALOG;
const out = process.env.AUDIT_OUTPUT ?? "/home/user/workspace/pricecrew-audit-evidence";
const builders = ["new-house","custom","service-call","time-materials","addition","bathroom","ev-charger","kitchen","recessed-lighting","service-upgrade","panel-replacement"];
test.describe("Electrical beta audit", () => {
  test.skip(!enabled, "Read-only catalog snapshot required for explicit audit run");
  for (const builder of builders) test(builder, async ({browser,request}) => {
    test.setTimeout(120_000);
    if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Audit requires a local disposable database");
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
      const customer=page.locator('input[id$="-customer"],#customerName').first();
      const project=page.locator('input[id$="-project"],#projectName').first();
      await customer.fill("QA Electrical Customer");
      await project.fill(`QA ${builder} realistic estimate`);
      const email=page.locator('input[id$="-email"],#customerEmail').first();
      if(await email.count())await email.fill("qa@example.com");
      await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("realistic estimate"))).toBe(true);
      evidence.draftBefore=await page.evaluate(()=>({...localStorage}));
      await page.reload();
      await page.getByTestId("button-restore-quote-draft").click();
      await expect(project).toHaveValue(`QA ${builder} realistic estimate`);
      evidence.draftRestored=true;
      // Actual UI defaults are a realistic first estimate for each specialized builder.
      // Flexible builders receive explicitly entered materials via the same API contract.
      const payload=structuredClone(evidence.initialRequest);
      if(builder==="custom")payload.jobInputs.materials=[{id:"qa-supplies",description:"Contractor-specified installation supplies",quantity:1,unit:"lot",unitCost:180}];
      if(builder==="time-materials")payload.jobInputs.miscellaneousMaterials=[{id:"qa-supplies",description:"Contractor-specified repair supplies",cost:75}];
      if(builder==="bathroom")payload.jobInputs.additionalReceptacles=1;
      evidence.testRequest=payload;
      const calculated=await request.post(`${api}/quotes/preview`,{headers,data:payload});
      evidence.previewStatus=calculated.status();evidence.preview=await calculated.json();
      expect(calculated.ok()).toBe(true);
      for(const width of [1280,768,375]){
        await page.setViewportSize({width,height:900});
        await page.evaluate("document.documentElement.classList.add('dark')");
        evidence.viewports.push({page:"builder",width,scrollWidth:await page.evaluate("document.documentElement.scrollWidth")});
        await page.screenshot({path:`${out}/${builder}-${width}.png`,fullPage:true});
      }
      // Save a draft, then explicitly test the customer-ready transition below.
      const data={...payload,customerName:"QA Electrical Customer",customerEmail:"qa@example.com",
        projectName:`QA ${builder} realistic estimate`,proposalDescription:`QA ${builder}: install the selected electrical work, test and clean up. O'Brien's "scope", with commas.\nSecond scope paragraph.`};
      const ready=await request.post(`${api}/quotes`,{headers,data});
      evidence.readyAttemptStatus=ready.status();evidence.readyAttempt=await ready.json();
      let quote=evidence.readyAttempt;
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
