import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  companiesTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
} from "@workspace/db";
import { seedEstimatorData } from "./estimating-seed";

class RollbackFreshSeedTest extends Error {}

test("fresh seed promotes verified pricing and inserts editable service and panel rows without overwriting edits", async () => {
  try {
    await db.transaction(async (transaction) => {
      await transaction.delete(quotesTable);
      await transaction.delete(priceBookItemsTable);
      await transaction.delete(customersTable);
      await transaction.delete(companySettingsTable);
      await transaction.delete(companiesTable);

      await seedEstimatorData(transaction as unknown as typeof db);

      const [seededSettings] = await transaction
        .select()
        .from(companySettingsTable);
      assert.equal(seededSettings?.serviceUpgradeCrewSize, 2);
      assert.equal(seededSettings?.serviceUpgradeHoursPerPerson, 16);
      assert.equal(seededSettings?.panelReplacementCrewSize, 2);
      assert.equal(seededSettings?.panelReplacementHoursPerPerson, 10);

      const seededRows = await transaction.select().from(priceBookItemsTable);
      const surge = seededRows.find(
        (row) => row.item === "Whole-home surge protection",
      );
      assert.equal(surge?.unitCost, 143);
      assert.equal(surge?.isDefault, false);

      for (const amperage of [100, 150, 200]) {
        assert.equal(
          seededRows.some(
            (row) => row.item === `${amperage}A outdoor meter/disconnect`,
          ),
          true,
        );
        for (const manufacturer of ["Siemens", "Eaton", "Square D"]) {
          assert.equal(
            seededRows.some(
              (row) =>
                row.item ===
                `${manufacturer} ${amperage}A service panel`,
            ),
            true,
          );
          assert.equal(
            seededRows.some(
              (row) =>
                row.item ===
                `${manufacturer} ${amperage}A panel replacement enclosure`,
            ),
            true,
          );
          for (const protectionType of [
            "Standard",
            "GFCI",
            "AFCI",
            "Dual Function",
          ]) {
            assert.equal(
              seededRows.some(
                (row) =>
                  row.manufacturer === manufacturer &&
                  row.amperage === amperage &&
                  row.poleCount === 2 &&
                  row.protectionType === protectionType,
              ),
              true,
            );
          }
        }
      }

      const editableRow = seededRows.find(
        (row) => row.item === "Siemens 200A panel replacement enclosure",
      );
      assert.ok(editableRow);
      await transaction
        .update(priceBookItemsTable)
        .set({ unitCost: 999, isDefault: false })
        .where(eq(priceBookItemsTable.id, editableRow.id));

      await seedEstimatorData(transaction as unknown as typeof db);
      const [preserved] = await transaction
        .select()
        .from(priceBookItemsTable)
        .where(eq(priceBookItemsTable.id, editableRow.id));
      assert.equal(preserved?.unitCost, 999);
      assert.equal(preserved?.isDefault, false);

      throw new RollbackFreshSeedTest();
    });
    assert.fail("Expected the fresh-seed transaction to roll back");
  } catch (error) {
    if (!(error instanceof RollbackFreshSeedTest)) throw error;
  }
});

test("legacy contractor-edited starter surge cost is preserved and becomes resolvable", async () => {
  try {
    await db.transaction(async (transaction) => {
      await transaction.delete(quotesTable);
      await transaction.delete(priceBookItemsTable);
      await transaction.delete(customersTable);
      await transaction.delete(companySettingsTable);
      await transaction.delete(companiesTable);

      await transaction
        .insert(companiesTable)
        .values({ id: 1, name: "Legacy seed test" });
      await transaction.insert(priceBookItemsTable).values({
        companyId: 1,
        category: "Protection",
        item: "Whole-home surge protection",
        unit: "ea",
        unitCost: 222,
        isDefault: true,
      });

      await seedEstimatorData(transaction as unknown as typeof db);
      const [surge] = await transaction
        .select()
        .from(priceBookItemsTable)
        .where(eq(priceBookItemsTable.item, "Whole-home surge protection"));
      assert.equal(surge?.unitCost, 222);
      assert.equal(surge?.isDefault, false);

      throw new RollbackFreshSeedTest();
    });
    assert.fail("Expected the legacy-seed transaction to roll back");
  } catch (error) {
    if (!(error instanceof RollbackFreshSeedTest)) throw error;
  }
});