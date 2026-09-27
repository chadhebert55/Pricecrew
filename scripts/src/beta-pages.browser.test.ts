import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

test("audit page surfaces at desktop tablet and phone widths",async({browser,request})=>{
  test.skip(!process.env.AUDIT_OUTPUT,"Explicit audit output required");
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))
    throw new Error("Audit requires a local disposable database");
  test.setTimeout(120000);
  const out=process.env.AUDIT_OUTPUT!;
  await mkdir(out,{recursive:true});
  const headers={"x-test-clerk-user-id":`audit_pages_${randomUUID()}`};
  expect((await request.get("http://127.0.0.1:5080/api/settings",{headers})).ok()).toBe(true);
  const context=await browser.newContext({extraHTTPHeaders:headers});
  await context.route("https://**/*",route=>{
    const h={...route.request().headers()};delete h["x-test-clerk-user-id"];
    return route.continue({headers:h});
  });
  const page=await context.newPage(), results:any[]=[];
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
  for(const path of ["/","/builders","/price-book","/customers","/settings","/billing"]){
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("main h1,main h2").first()).toBeVisible();
    const dark=page.getByRole("button",{name:"Switch to dark mode"});
    if(await dark.count())await dark.click();
    for(const width of [1280,768,375]){
      await page.setViewportSize({width,height:900});
      const name=path==="/"?"dashboard":path.slice(1);
      await page.screenshot({path:`${out}/surface-${name}-${width}.png`,fullPage:true});
      const text=await page.locator("main").innerText();
      const status=/Something went wrong|Unable to load/i.test(text) ? "BLOCKED" : "RENDERED";
      results.push({path,width,status,scrollWidth:await page.evaluate("document.documentElement.scrollWidth"),
        headings:await page.locator("h1,h2").allTextContents(),text});
    }
  }
  await writeFile(`${out}/surface-audit.json`,JSON.stringify({results,errors},null,2));
  await context.close();
});
