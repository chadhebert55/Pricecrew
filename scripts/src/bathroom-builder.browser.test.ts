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
    await db.update(companySettingsTable).set({residentialLaborSellRate:150,commercialLaborSellRate:165,
      loadedLaborCost:65,materialMarkup:.25,targetMargin:.4}).where(eq(companySettingsTable.companyId,companyId))
    const page=await context.newPage(),next=()=>page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"))
    let pending=next()
    await page.goto(`/quotes/new/bathroom?draftScope=${marker}`)
    const response=await pending,initial=response.request().postDataJSON()
    expect(initial.jobInputs.bathroomCircuits).toHaveLength(2)
    await expect(page.getByTestId("bathroom-active-circuit")).toHaveCount(2)
    await expect(page.getByLabel("Circuit Quantity",{exact:true})).toHaveCount(2)
    await expect(page.locator("#bath-circuit-0-poles")).toBeHidden()
    await page.locator("summary").filter({hasText:/^Lighting/}).click()
    await expect(page.locator("#bath-recessed-size")).toHaveCount(0)
    await page.locator("#bath-recessedLights").fill("2")
    await expect(page.locator("#bath-recessed-size")).toBeVisible()
    await page.locator("summary").filter({hasText:/^Customer-Supplied Items/}).click()
    await expect(page.getByLabel("Customer supplies recessed fixtures")).toBeVisible()
    await page.locator("#bath-recessedLights").fill("0")
    await expect(page.locator("#bath-recessed-size")).toHaveCount(0)
    await expect(page.getByLabel("Customer supplies recessed fixtures")).toHaveCount(0)
    await page.locator("summary").filter({hasText:/^Customer-Supplied Items/}).click()
    await page.locator("summary").filter({hasText:/^Lighting/}).click()
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
    for(const item of keys)await db.insert(priceBookItemsTable).values({companyId,item,category:"Other",unit:item.endsWith(" cable")?"ft":"ea",unitCost:2,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
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
      expect(quote.pricing.laborCost).toBe(Number((quote.pricing.finalLaborHours*65).toFixed(2)))
      expect(quote.pricing.laborSellAmount).toBe(Number((quote.pricing.finalLaborHours*150).toFixed(2)))
      expect(quote.pricing.grossProfit).toBe(Number((quote.total-quote.pricing.materialCost-quote.pricing.laborCost).toFixed(2)))
      expect((await request.patch(`${api}/quotes/${quote.id}`,{headers,data:{status:"ready"}})).ok()).toBe(true)
    }
    pending=next()
    await page.locator("#bath-circuit-0-length").fill("35")
    await pending
    await expect(page.getByRole("button",{name:"Generate Bathroom Quote",exact:true})).toBeEnabled()
    await page.getByRole("button",{name:"+ Add Circuit"}).click()
    await expect(page.locator("#bath-circuit-2-name")).toBeVisible()
    await expect(page.getByTestId("bathroom-active-circuit")).toHaveCount(3)
    await page.getByRole("button",{name:"Remove circuit 3",exact:true}).click()
    await expect(page.getByTestId("bathroom-active-circuit")).toHaveCount(2)
    await page.getByRole("button",{name:"+ Add Circuit"}).click()
    await page.locator("#bath-circuit-2-name").fill("Saved extra circuit")
    await page.locator("#bath-circuit-2-quantity").fill("2")
    await page.locator("#bath-additionalReceptacles").fill("1")
    await page.locator("#bathroom-customer").fill(`Bathroom ${marker}`)
    await page.locator("#bathroom-project").fill("Bathroom recovery test")
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("Bathroom recovery test"))).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(page.locator("#bath-circuit-0-length")).toHaveValue("35")
    await expect(page.locator("#bath-circuit-2-name")).toHaveValue("Saved extra circuit")
    await expect(page.locator("#bath-circuit-2-quantity")).toHaveValue("2")
    await expect(page.locator("#bath-additionalReceptacles")).toHaveValue("1")
    await expect(page.locator("#bath-circuit-0-quantity")).toHaveValue("1")
    await page.getByRole("button",{name:"Remove circuit 3",exact:true}).click()
    await page.locator("#bath-circuit-0-quantity").fill("0")
    await expect(page.getByTestId("bathroom-active-circuit")).toHaveCount(1)
    await page.getByText("Inactive circuits (1)",{exact:true}).click()
    await page.getByRole("button",{name:"Restore circuit 1",exact:true}).click()
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
