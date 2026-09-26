import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { companiesTable, companyMembersTable, companySettingsTable, customersTable, db, priceBookItemsTable, quotesTable } from "@workspace/db"

const api="http://127.0.0.1:5080/api"
// QA: all eight requested calculation scenarios are independently covered by
// engine tests. Here trace preview -> saved quote -> ready guard, then exercise
// real controls, signed adjustments, draft recovery and responsive layouts.
test("Kitchen circuits, readiness, saved totals, and responsive draft recovery",async({browser,request},info)=>{
  const marker=randomUUID(), userId=`kitchen_v2_${marker}`,headers={"x-test-clerk-user-id":userId}
  let companyId:number|undefined
  const context=await browser.newContext({extraHTTPHeaders:headers,viewport:{width:1280,height:900}})
  try{
    await request.get(`${api}/settings`,{headers})
    const [membership]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId))
    companyId=membership!.companyId
    const page=await context.newPage()
    const next=()=>page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"))
    let pending=next()
    await page.goto(`/quotes/new/kitchen?draftScope=${marker}`)
    const firstResponse=await pending
    const initial=firstResponse.request().postDataJSON()
    const incomplete=await firstResponse.json()
    expect(incomplete.assembly.filter((l:any)=>l.id.startsWith("kitchen-home-run-")).reduce((s:number,l:any)=>s+l.quantity,0)).toBe(400)
    await expect(page.getByRole("button",{name:"Generate Kitchen Quote",exact:true})).toBeDisabled()
    await expect(page.getByRole("button",{name:"Generate Draft / Unfinished Quote"})).toBeEnabled()
    await expect(page.getByText("Review Issues",{exact:false})).toBeVisible()
    // Supply isolated, explicit test catalog prices, never production data.
    const keys=new Set<string>(incomplete.pricing.pricingWarnings.map((w:any)=>w.context?.itemKey).filter(Boolean))
    for(const item of keys){
      if(/breaker/i.test(item)) continue
      await db.insert(priceBookItemsTable).values({companyId,item,category:"Other",unit:item.includes("cable")?"ft":"ea",unitCost:2,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    }
    for(const item of ["appliance connection box","smart switch","duplex receptacle wall plate","NM cable connector","6/3 NM-B cable"]){
      if(keys.has(item)) continue
      await db.insert(priceBookItemsTable).values({companyId,item,category:"Other",unit:item.includes("cable")?"ft":"ea",unitCost:2,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    }
    for(const [amperage,poleCount,protectionType] of [[15,1,"Dual Function"],[20,1,"Dual Function"],[50,2,"Standard"],[20,1,"GFCI"]] as const){
      await db.insert(priceBookItemsTable).values({companyId,item:`Siemens ${amperage}A ${poleCount}-pole ${protectionType} breaker`,category:"Protection",unit:"ea",unitCost:40,
        manufacturer:"Siemens",amperage,poleCount,protectionType,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    }
    const scenarios=[{}, {electricRangeCircuits:1}, {wallOvenCircuits:1}, {electricRangeCircuits:1,wallOvenCircuits:1},
      {threeWayOptions:1,fourWayLocations:1,fourWayCableFootage:20},
      {smartSwitches:2}, {additionalBreakers:[{key:"extra",quantity:2,amperage:20,poleCount:1,protectionType:"GFCI",cableType:"12/2 NM-B"}]},
      {customerSuppliedFixtures:true,islandPendants:3}]
    // Populate the exact 4-way products only for the scenario that selects them.
    for(const item of ["Legrand radiant TM874WCC10 15A 4-way switch","Legrand radiant RWP26WCC10 1-gang screwless wall plate","14/3 NM-B cable"])
      if(!keys.has(item))await db.insert(priceBookItemsTable).values({companyId,item,category:"Other",unit:item.includes("cable")?"ft":"ea",unitCost:2,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    for(const [index,changes] of scenarios.entries()){
      const payload={...initial,jobInputs:{...initial.jobInputs,...changes,laborAdjustmentHours:-.5}}
      const previewResponse=await request.post(`${api}/quotes/preview`,{headers,data:payload})
      expect(previewResponse.ok()).toBe(true)
      const preview=await previewResponse.json()
      expect(preview.pricing.pricingWarnings.filter((w:any)=>w.severity==="error")).toEqual([])
      const createdResponse=await request.post(`${api}/quotes`,{headers,data:{...payload,customerName:`QA ${marker}`,projectName:`Kitchen ${index}`,proposalDescription:"Kitchen regression scope"}})
      expect(createdResponse.status()).toBe(201)
      const created=await createdResponse.json()
      expect(created.pricing).toEqual(preview.pricing)
      expect(created.assembly).toEqual(preview.assembly)
      expect(created.total).toBe(preview.pricing.finalSellingPrice)
      expect((await request.patch(`${api}/quotes/${created.id}`,{headers,data:{status:"ready"}})).ok()).toBe(true)
    }
    pending=next()
    await page.locator("#kitchen-electricRangeCircuits-quantity").fill("1")
    await pending
    await expect(page.locator("#kitchen-electricRangeCircuits-amperage")).toHaveValue("50")
    await page.locator("#kitchen-wallOvenCircuits-quantity").fill("1")
    await expect(page.getByRole("button",{name:"Generate Kitchen Quote",exact:true})).toBeEnabled()
    await page.getByText("Wiring & Pricing",{exact:false}).click()
    pending=next()
    await page.locator("#kitchen-labor-adj").fill("-1")
    const adjusted=await (await pending).json()
    expect(adjusted.pricing.manualLaborAdjustmentHours).toBe(-1)
    await page.locator("#kitchen-customer").fill(`Kitchen browser ${marker}`)
    await page.locator("#kitchen-project").fill("Kitchen field test")
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("Kitchen field test"))).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(page.locator("#kitchen-electricRangeCircuits-quantity")).toHaveValue("1")
    await expect(page.locator("#kitchen-wallOvenCircuits-quantity")).toHaveValue("1")
    await expect(page.getByRole("button",{name:"Generate Kitchen Quote",exact:true})).toBeEnabled()
    for(const width of [1280,768,375]){
      await page.setViewportSize({width,height:900})
      await page.evaluate("document.documentElement.classList.add('dark')")
      await page.getByText("Kitchen Summary",{exact:true}).scrollIntoViewIfNeeded()
      expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(width)
      await page.screenshot({path:info.outputPath(`kitchen-${width}.png`),fullPage:true})
    }
    await page.setViewportSize({width:1280,height:900})
    pending=next()
    await page.locator("#kitchen-electricRangeCircuits-amperage").selectOption("60")
    await pending
    await expect(page.getByRole("button",{name:"Generate Kitchen Quote",exact:true})).toBeDisabled()
    await page.getByRole("button",{name:"Generate Draft / Unfinished Quote"}).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    const id=Number(page.url().split("/").at(-1))
    expect((await request.patch(`${api}/quotes/${id}`,{headers,data:{status:"ready"}})).status()).toBe(409)
  }finally{
    await context.close()
    if(companyId){
      await db.delete(quotesTable).where(eq(quotesTable.companyId,companyId))
      await db.delete(customersTable).where(eq(customersTable.companyId,companyId))
      await db.delete(priceBookItemsTable).where(eq(priceBookItemsTable.companyId,companyId))
      await db.delete(companySettingsTable).where(eq(companySettingsTable.companyId,companyId))
      await db.delete(companyMembersTable).where(eq(companyMembersTable.userId,userId))
      await db.delete(companiesTable).where(eq(companiesTable.id,companyId))
    }
  }
})
