import { expect,test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { companiesTable,companyMembersTable,companySettingsTable,customersTable,db,priceBookItemsTable,quotesTable } from "@workspace/db"
const api="http://127.0.0.1:5080/api"
test("Recessed lighting scenarios, conditional controls, saved financials and recovery",async({browser,request},info)=>{
  const marker=randomUUID(),userId=`recessed_v2_${marker}`,headers={"x-test-clerk-user-id":userId}
  let companyId:number|undefined
  const context=await browser.newContext({extraHTTPHeaders:headers,viewport:{width:1280,height:900}})
  try{
    await request.get(`${api}/settings`,{headers})
    const [member]=await db.select().from(companyMembersTable).where(eq(companyMembersTable.userId,userId))
    companyId=member!.companyId
    const page=await context.newPage(),next=()=>page.waitForResponse(r=>r.url().endsWith("/api/quotes/preview"))
    let pending=next()
    await page.goto(`/quotes/new/recessed-lighting?draftScope=${marker}`)
    const first=await pending,initial=first.request().postDataJSON()
    await expect(page.getByRole("button",{name:"Generate Recessed Lighting Quote",exact:true})).toBeDisabled()
    const base={...initial.jobInputs,fixtureQuantity:6,lightingGroups:[{key:"main",quantity:6,controlType:"Dimmer"}]}
    const scenarios=[
      {...base,fixtureQuantity:4,wiringScope:"Existing wiring / fixture replacement",locationType:"Replace existing fixtures",lightingGroups:[{key:"main",quantity:4,controlType:"Existing switch"}]},
      base,
      {...base,fixtureQuantity:8,wiringScope:"New home run to panel",lightingGroups:[{key:"main",quantity:8,controlType:"Dimmer"}]},
      {...base,lightingGroups:[{key:"main",quantity:6,controlType:"3-way switching",fourWayLocations:1,travelerLength:30}]},
      {...base,fixtureQuantity:12,lightingGroups:[{key:"a",quantity:6,controlType:"Dimmer"},{key:"b",quantity:6,controlType:"Dimmer"}]},
      {...base,accessDifficulty:"Limited / blind access",ceilingHeight:"High 11-14 ft",insulationPresent:true},
      {...base,customerSuppliedFixtures:true},
    ]
    const keys=new Set<string>()
    for(const jobInputs of scenarios){
      const p=await (await request.post(`${api}/quotes/preview`,{headers,data:{...initial,jobInputs}})).json()
      for(const w of p.pricing.pricingWarnings)if(w.context?.itemKey&&!/breaker/i.test(w.context.itemKey))keys.add(w.context.itemKey)
    }
    for(const item of keys)await db.insert(priceBookItemsTable).values({companyId,item,category:"Other",unit:item.includes("cable")?"ft":"ea",unitCost:2,supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    await db.insert(priceBookItemsTable).values({companyId,item:"Siemens 15A 1-pole AFCI breaker",category:"Protection",unit:"ea",unitCost:40,manufacturer:"Siemens",amperage:15,poleCount:1,protectionType:"AFCI",supplier:"QA only",sourceDate:"2026-09-26",isDefault:false})
    for(const [index,jobInputs] of scenarios.entries()){
      const data={...initial,jobInputs:{...jobInputs,laborAdjustmentHours:-.5}}
      const preview=await (await request.post(`${api}/quotes/preview`,{headers,data})).json()
      expect(preview.pricing.pricingWarnings.filter((w:any)=>w.severity==="error")).toEqual([])
      const saved=await request.post(`${api}/quotes`,{headers,data:{...data,customerName:`QA ${marker}`,projectName:`Recessed ${index}`,proposalDescription:"Recessed lighting scope"}})
      expect(saved.status()).toBe(201)
      const quote=await saved.json()
      expect(quote.pricing).toEqual(preview.pricing)
      expect(quote.assembly).toEqual(preview.assembly)
      expect(quote.total).toBe(preview.pricing.finalSellingPrice)
      expect((await request.patch(`${api}/quotes/${quote.id}`,{headers,data:{status:"ready"}})).ok()).toBe(true)
    }
    pending=next()
    await page.locator("#recessed-wiring-scope").selectOption("Existing wiring / fixture replacement")
    await pending
    await expect(page.locator("#recessed-route")).toBeHidden()
    await expect(page.locator("#recessed-manufacturer")).toBeHidden()
    await page.locator("#recessed-group-0-control").selectOption("Existing switch")
    await expect(page.getByRole("button",{name:"Generate Recessed Lighting Quote",exact:true})).toBeEnabled()
    await page.getByText("Room Planning Guidance",{exact:false}).click()
    await page.locator("#recessed-room-length").fill("30")
    await expect(page.locator("#recessed-quantity")).toHaveValue("4")
    await page.getByRole("button",{name:"Apply planning suggestion"}).click()
    await expect(page.locator("#recessed-quantity")).toHaveValue("8")
    await expect(page.getByText("Quantity source: Planning suggestion")).toBeVisible()
    await page.locator("#recessed-quantity").fill("12")
    await page.getByRole("button",{name:"+ Add Lighting Group"}).click()
    await page.locator("#recessed-group-0-quantity").fill("6")
    await page.locator("#recessed-group-1-quantity").fill("6")
    await page.locator("#recessed-group-0-control").selectOption("Dimmer")
    await page.locator("#recessed-wiring-scope").selectOption("New home run to panel")
    await expect(page.locator("#recessed-manufacturer")).toBeVisible()
    await page.locator("#recessed-location-type").selectOption("Create new light locations")
    await page.locator("#recessed-customer").fill(`Recessed ${marker}`)
    await page.locator("#recessed-project").fill("Lighting recovery test")
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(localStorage).includes("Lighting recovery test"))).toBe(true)
    await page.reload()
    await page.getByTestId("button-restore-quote-draft").click()
    await expect(page.locator("#recessed-group-1-quantity")).toHaveValue("6")
    await expect(page.getByRole("button",{name:"Generate Recessed Lighting Quote",exact:true})).toBeEnabled()
    await page.locator("summary").filter({hasText:/^Labor/}).click()
    pending=next()
    await page.locator("#recessed-labor-adj").fill("-1")
    expect((await (await pending).json()).pricing.manualLaborAdjustmentHours).toBe(-1)
    for(const width of [1280,768,375]){
      await page.setViewportSize({width,height:900})
      await page.evaluate("document.documentElement.classList.add('dark')")
      expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(width)
      await page.screenshot({path:info.outputPath(`recessed-${width}.png`),fullPage:true})
    }
    pending=next()
    await page.locator("#recessed-group-1-quantity").fill("7")
    await pending
    await expect(page.getByRole("button",{name:"Generate Recessed Lighting Quote",exact:true})).toBeDisabled()
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
