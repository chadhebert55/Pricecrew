import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { companiesTable, companyMembersTable, companySettingsTable, customersTable, db, priceBookItemsTable, quotesTable } from "@workspace/db"

const api="http://127.0.0.1:5080/api"
test("Bathroom circuit scenarios, saved financials, safety and responsive draft recovery",async({browser,request},info)=>{
  const marker=randomUUID(),userId=`bath_v2_${marker}`,headers={"x-test-clerk-user-id":userId}
  let companyId:number|undefined
  const context=await browser.newContext({extraHTTPHeaders:headers,viewport:{width:1280,height:900}})
  try{
    await request.get(`${api}/settings`,{headers})
    const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId))
    companyId=member!.companyId
    const page=await context.newPage(),next=()=>page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"))
    let pending=next()
    await page.goto(`/quotes/new/bathroom?draftScope=${marker}`)
    const response=await pending,initial=response.request().postDataJSON()
    await expect(page.getByRole("button",{name:"Generate Bathroom Quote",exact:true})).toBeDisabled()
    const scenarios=[
      {...initial.jobInputs,bathroomCircuits:[],additionalSwitches:3},
      {...initial.jobInputs,additionalReceptacles:2,recessedLights:3},
      {...initial.jobInputs,exhaustFans:0,fanLightHeatUnits:1,heatedFloorCircuit:true,heatedFloorThermostat:true,
        showerLights:1,dimmers:1,smartSwitches:1,fanControl:"Humidity-sensing control"},
      {...initial.jobInputs,bathroomCircuits:[],branchWiringLength:0,additionalReceptacles:2},
    ]
    const keys=new Set<string>()
    for(const jobInputs of scenarios){
      const result=await (await request.post(`${api}/quotes/preview`,{headers,data:{...initial,jobInputs}})).json()
      for(const w of result.pricing.pricingWarnings) if(w.context?.itemKey&&!/breaker/i.test(w.context.itemKey))keys.add(w.context.itemKey)
    }
    for(const item of keys)await db.insert(priceBookItemsTable).values({companyId,item,category:"Other",unit:item.includes("cable")?"ft":"ea",unitCost:2,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    for(const [amperage,protectionType] of [[15,"AFCI"],[20,"Dual Function"],[20,"GFCI"]] as const)
      await db.insert(priceBookItemsTable).values({companyId,item:`Siemens ${amperage}A 1-pole ${protectionType} breaker`,category:"Protection",unit:"ea",unitCost:40,
        manufacturer:"Siemens",amperage,poleCount:1,protectionType,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    for(const [index,jobInputs] of scenarios.entries()){
      const data={...initial,jobInputs:{...jobInputs,laborAdjustmentHours:-.5}}
      const preview=await (await request.post(`${api}/quotes/preview`,{headers,data})).json()
      expect(preview.pricing.pricingWarnings.filter((w:any)=>w.severity==="error")).toEqual([])
      const saved=await request.post(`${api}/quotes`,{headers,data:{...data,customerName:`QA ${marker}`,projectName:`Bathroom ${index}`,proposalDescription:"Bathroom scope"}})
      expect(saved.status()).toBe(201)
      const quote=await saved.json()
      expect(quote.pricing).toEqual(preview.pricing)
      expect(quote.assembly).toEqual(preview.assembly)
      expect(quote.total).toBe(preview.pricing.finalSellingPrice)
      expect((await request.patch(`${api}/quotes/${quote.id}`,{headers,data:{status:"ready"}})).ok()).toBe(true)
    }
    pending=next()
    await page.locator("#bath-circuit-0-length").fill("35")
    await pending
    await expect(page.getByRole("button",{name:"Generate Bathroom Quote",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:"+ Add Circuit"}).click()
    await expect(page.locator("#bath-circuit-3-name")).toBeVisible()
    await page.locator("#bathroom-customer").fill(`Bathroom ${marker}`)
    await page.locator("#bathroom-project").fill("Bathroom recovery test")
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("Bathroom recovery test"))).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(page.locator("#bath-circuit-0-length")).toHaveValue("35")
    await page.getByText("Wiring & Pricing",{exact:false}).click()
    pending=next()
    await page.locator("#bath-labor-adj").fill("-1")
    expect((await (await pending).json()).pricing.manualLaborAdjustmentHours).toBe(-1)
    for(const width of [1280,768,375]){
      await page.setViewportSize({width,height:900})
      await page.evaluate("document.documentElement.classList.add('dark')")
      expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(width)
      await page.screenshot({path:info.outputPath(`bathroom-${width}.png`),fullPage:true})
    }
    pending=next()
    await page.locator("#bath-circuit-0-cable").selectOption("14/2 NM-B")
    await pending
    await expect(page.getByRole("button",{name:"Generate Bathroom Quote",exact:true})).toBeDisabled()
    await page.getByRole("button",{name:"Generate Draft / Unfinished Quote"}).click()
    await expect(page).toHaveURL(/\/quotes\/\d+$/)
    expect((await request.patch(`${api}/quotes/${page.url().split("/").at(-1)}`,{headers,data:{status:"ready"}})).status()).toBe(409)
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
