import { expect, type Page } from "@playwright/test";
/** Preserve pre-room-package exhaust-only fixture scope through the new visible UI. */
export async function configureExhaustOnlyRoom(page: Page) {
  await page.locator("#addition-room-bathroom").check();
  for (const key of [
    "gfciReceptacles",
    "additionalReceptacles",
    "vanityLights",
    "recessedLights",
    "showerLights",
    "switches",
  ])
    await page.locator(`#addition-bathroom-${key}`).fill("0");
  // Keep the fixture's original configured circuit; explicitly assign it, removing suggestions.
  await page
    .getByRole("button", { name: "Remove circuit 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove circuit 2", exact: true })
    .click();
  await page
    .locator("#addition-circuit-0-room")
    .selectOption("bathroom-lighting");
  await page.locator("#addition-circuit-0-reviewed").check();
  await expect(page.locator("#addition-circuit-0-reviewed")).toBeChecked();
}
