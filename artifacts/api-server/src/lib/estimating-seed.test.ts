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
      assert.equal(surge?.supplier, "Company verified cost");
      assert.equal(surge?.isDefault, false);

      const expectedNortheastCatalog = [
        ["8/3 NM-B cable", 2.682868, "Wic.", "WIC. ROMEX 8/3", "19117", "98010026338"],
        ["8/2 NM-B cable", 1.89096, "Wic.", "WIC. ROMEX 8/2", "22923", "98010026315"],
        ["6/3 NM-B cable", 3.921784, "Wic.", "WIC. ROMEX 6/3", "25138", "98010026371"],
        ["12/2 NM-B cable", 0.562271, "Wic.", "WIC. ROMEX 12/2", "3873", "98010026305"],
        ["14/2 NM-B cable", 0.379697, "Wic.", "WIC. ROMEX 14/2", "27892", "98010026300"],
        ["14/3 NM-B cable", 0.53995, "Wic.", "WIC. ROMEX 14/3", "10802", "98010026350"],
        ["#8 copper THHN", 0.700684, "Wic.", "WIC. THHN 8 STR", "61161", "98010023129"],
        ["1/0 aluminum XHHW conductor", 0.730841, "Wia.", "WIA. XHHW 1/0 S", "1020694", "980120S4718"],
        ["3/0 aluminum XHHW conductor", 1.072337, "Wia.", "WIA. XHHW 3/0 S", "1005949", "980120S0164"],
        ["4/0 aluminum XHHW conductor", 1.191903, "Wia.", "WIA. XHHW 4/0 S", "392124", "980120S0174"],
        ["1/0 aluminum SER cable", 2.631865, "Wia.", "WIA. SER 1/0-1/", "295793", "980120S0025"],
        ["3/0 aluminum SER cable", 3.930704, "Wia.", "WIA. SER 3/0-3/", "239619", "980120S0034"],
      ] as const;
      for (const [item, unitCost, manufacturer, manufacturerPartNumber, supplierSku, upc] of expectedNortheastCatalog) {
        const row = seededRows.find((candidate) => candidate.item === item);
        assert.equal(row?.unitCost, unitCost);
        assert.equal(row?.supplier, "Northeast Electrical");
        assert.equal(row?.manufacturer, manufacturer);
        assert.equal(row?.manufacturerPartNumber, manufacturerPartNumber);
        assert.equal(row?.supplierSku, supplierSku);
        assert.equal(row?.upc, upc);
        assert.equal(row?.unit, "ft");
        assert.equal(row?.sourceDate, "2026-08-25");
      }
      for (const [item, unitCost, unit, supplierSku, upc] of [
        ["Siemens MC0816B1200 200A meter-load-center — SKU 132873", 523.989, "ea", "132873", "78364351070"],
        ["Wia 4/0 aluminum SER — SKU 1266468", 3.30776, "ft", "1266468", "980120S4953"],
        ["Erico 615880 5/8x8ft copper ground rod — SKU 160523", 25.313, "ea", "160523", "78285630609"],
        ["PVCFIT 2-inch Sch40 PVC conduit — 100-foot confirmed package — SKU 8891", 1.12886, "ft", "8891", "98006006026"],
        ["AGP DS1 1lb duct seal — SKU 1009903", 3.801, "ea", "1009903", "78073020001"],
      ] as const) {
        const row = seededRows.find((candidate) => candidate.item === item);
        assert.equal(row?.unitCost, unitCost);
        assert.equal(row?.unit, unit);
        assert.equal(row?.supplier, "Northeast Electrical");
        assert.equal(row?.supplierSku, supplierSku);
        assert.equal(row?.upc, upc);
        assert.equal(row?.sourceDate, "2026-08-25");
      }
      for (const [item, unitCost, unit, supplierSku, manufacturerPartNumber] of [
        ["Milbank U3990-XL-200 200A meter-main — SKU 304898", 441.525, "ea", "304898", "U3990-XL-200"],
        ["Siemens PN4040B1200C 200A 40-space panel — SKU 1552599", 294.625, "ea", "1552599", "PN4040B1200C"],
        ["Pass & Seymour S1-18-W 1-gang box — SKU 18134", 2.4769, "ea", "18134", "S1-18-W"],
        ["Pass & Seymour TM870-W 15A single-pole switch — SKU 3211", 1.85, "ea", "3211", "TM870-W"],
        ["Pass & Seymour TM873-W 15A 3-way switch — SKU 32128", 2.25, "ea", "32128", "TM873-W"],
        ["Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393", 30.28, "ea", "607393", "DVCL-153P-WH"],
      ] as const) {
        const row = seededRows.find((candidate) => candidate.item === item);
        assert.equal(row?.unitCost, unitCost);
        assert.equal(row?.unit, unit);
        assert.equal(row?.supplier, "Northeast Electrical");
        assert.equal(row?.supplierSku, supplierSku);
        assert.equal(row?.manufacturerPartNumber, manufacturerPartNumber);
        assert.equal(row?.sourceDate, "2026-08-27");
      }
      for (const [item, unitCost, manufacturerPartNumber] of [
        ["Juno WF4DREGSMAL 4-inch regressed wafer light", 30.605, "WF4DREGSMAL"],
        ["Juno WF6-DREG 6-inch regressed wafer light", 34.006, "WF6-DREG"],
      ] as const) {
        const row = seededRows.find((candidate) => candidate.item === item);
        assert.equal(row?.unitCost, unitCost);
        assert.equal(row?.unit, "ea");
        assert.equal(row?.supplier, "Company verified cost");
        assert.equal(row?.manufacturer, "Juno");
        assert.equal(row?.manufacturerPartNumber, manufacturerPartNumber);
        assert.equal(row?.sourceDate, "2026-08-27");
      }
      for (const [item, unitCost, supplier, supplierSku] of [
        ["4/0 aluminum SER cable", 4.4198, "Company verified cost", null],
        ["intersystem bonding terminal", 15.1108, "Northeast Electrical", "1054291"],
        ["#8 solid grounding conductor", 0.6337, "Northeast Electrical", "21465"],
        ["#4 green bonding conductor", 1.7836, "Northeast Electrical", "77344"],
      ] as const) {
        const row = seededRows.find((candidate) => candidate.item === item);
        assert.equal(row?.unitCost, unitCost);
        assert.equal(row?.unit, item === "intersystem bonding terminal" ? "ea" : "ft");
        assert.equal(row?.supplier, supplier);
        assert.equal(row?.supplierSku, supplierSku);
        assert.equal(row?.sourceDate, "2026-08-27");
      }

      for (const [item, unitCost, supplierSku, manufacturerPartNumber] of [
        ["Siemens Q115 15A 1-pole standard breaker", 8.673, "17237", "ITE Q115"],
        ["Siemens Q115DF 15A 1-pole dual-function breaker", 69.239, "938243", "ITE Q115DF"],
        ["Eaton BR115 15A 1-pole standard breaker", 19.647, "20956", "C-H BR115"],
        ["Eaton BRN115AF 15A 1-pole AFCI breaker", 113.411, "1319470", "C-H BRN115AF"],
        ["Eaton BRN115DF 15A 1-pole dual-function breaker", 166.124, "1366627", "C-H BRN115DF"],
        ["Square D Homeline HOM115 15A 1-pole standard breaker", 13.321, "15367", "SQD HOM115"],
        ["Square D Homeline HOM115GFI 15A 1-pole GFCI breaker", 133.568, "8508", "SQD HOM115GFI"],
        ["Square D 50A 2-pole GFCI breaker", 278.491, "87379", "SQD HOM250GFI"],
      ] as const) {
        const row = seededRows.find((candidate) => candidate.item === item);
        assert.equal(row?.unitCost, unitCost);
        assert.equal(row?.supplier, "Northeast Electrical");
        assert.equal(row?.supplierSku, supplierSku);
        assert.equal(row?.manufacturerPartNumber, manufacturerPartNumber);
        assert.equal(row?.sourceDate, "2026-08-25");
      }
      for (const item of [
        "1/0 copper service conductor alternative",
        "2/0 copper service conductor alternative",
        "4/0 copper service conductor alternative",
      ]) {
        assert.equal(
          seededRows.find((row) => row.item === item)?.unitCost,
          0,
        );
      }

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

      const exactCatalogRow = seededRows.find(
        (row) => row.item === "Wia 4/0 aluminum SER — SKU 1266468",
      );
      assert.ok(exactCatalogRow);
      await transaction
        .update(priceBookItemsTable)
        .set({
          unitCost: 7.654321,
          supplier: "Contractor SER supplier",
          upc: "contractor-stock-reference",
          isDefault: false,
        })
        .where(eq(priceBookItemsTable.id, exactCatalogRow.id));
      await seedEstimatorData(transaction as unknown as typeof db);
      const [preservedExactCatalogRow] = await transaction
        .select()
        .from(priceBookItemsTable)
        .where(eq(priceBookItemsTable.id, exactCatalogRow.id));
      assert.equal(preservedExactCatalogRow?.unitCost, 7.654321);
      assert.equal(preservedExactCatalogRow?.supplier, "Contractor SER supplier");
      assert.equal(preservedExactCatalogRow?.upc, "contractor-stock-reference");

      throw new RollbackFreshSeedTest();
    });
    assert.fail("Expected the fresh-seed transaction to roll back");
  } catch (error) {
    if (!(error instanceof RollbackFreshSeedTest)) throw error;
  }
});

test("known prior system catalog rows upgrade while contractor catalog edits survive reseeding", async () => {
  try {
    await db.transaction(async (transaction) => {
      await transaction.delete(quotesTable);
      await transaction.delete(priceBookItemsTable);
      await transaction.delete(customersTable);
      await transaction.delete(companySettingsTable);
      await transaction.delete(companiesTable);
      await transaction
        .insert(companiesTable)
        .values({ id: 1, name: "Catalog reconciliation test" });
      await transaction.insert(priceBookItemsTable).values([
        {
          companyId: 1,
          category: "Conductor",
          item: "12/2 NM-B cable",
          unit: "ft",
          unitCost: 0.56,
          supplier: "Northeast Electrical",
          sourceDate: "2026-08-25",
          isDefault: false,
        },
        {
          companyId: 1,
          category: "Conductor",
          item: "14/2 NM-B cable",
          unit: "ft",
          unitCost: 0.91,
          supplier: "Northeast Electrical",
          sourceDate: "2026-08-25",
          isDefault: false,
        },
        {
          companyId: 1,
          category: "Protection",
          item: "Siemens Q115 15A 1-pole standard breaker",
          unit: "ea",
          unitCost: 0,
          supplier: "Company default — set current cost",
          manufacturer: "Siemens",
          manufacturerPartNumber: "Q115",
          supplierSku: "Q115",
          sourceDate: "2026-08-26",
          amperage: 15,
          poleCount: 1,
          protectionType: "Standard",
          isDefault: false,
        },
      ]);

      await seedEstimatorData(transaction as unknown as typeof db);
      const rows = await transaction.select().from(priceBookItemsTable);
      const upgraded = rows.find((row) => row.item === "12/2 NM-B cable");
      assert.equal(upgraded?.unitCost, 0.562271);
      assert.equal(upgraded?.manufacturer, "Wic.");
      assert.equal(upgraded?.supplierSku, "3873");
      assert.equal(
        rows.find((row) => row.item === "14/2 NM-B cable")?.unitCost,
        0.91,
      );
      assert.equal(
        rows.filter((row) => row.item === "12/2 NM-B cable").length,
        1,
      );
      const upgradedBreaker = rows.find(
        (row) => row.item === "Siemens Q115 15A 1-pole standard breaker",
      );
      assert.equal(upgradedBreaker?.unitCost, 8.673);
      assert.equal(upgradedBreaker?.supplierSku, "17237");
      assert.equal(upgradedBreaker?.manufacturerPartNumber, "ITE Q115");
      assert.equal(upgradedBreaker?.upc, "78364314818");

      throw new RollbackFreshSeedTest();
    });
    assert.fail("Expected the catalog reconciliation transaction to roll back");
  } catch (error) {
    if (!(error instanceof RollbackFreshSeedTest)) throw error;
  }
});

test("an untouched seeded Northeast row gains its catalog UPC without overwriting a contractor edit", async () => {
  try {
    await db.transaction(async (transaction) => {
      await transaction.delete(quotesTable);
      await transaction.delete(priceBookItemsTable);
      await transaction.delete(customersTable);
      await transaction.delete(companySettingsTable);
      await transaction.delete(companiesTable);
      await transaction
        .insert(companiesTable)
        .values({ id: 1, name: "UPC reconciliation test" });
      await transaction.insert(priceBookItemsTable).values([
        {
          companyId: 1,
          category: "Conductor",
          item: "12/2 NM-B cable",
          unit: "ft",
          unitCost: 0.562271,
          supplier: "Northeast Electrical",
          manufacturer: "Wic.",
          manufacturerPartNumber: "WIC. ROMEX 12/2",
          supplierSku: "3873",
          sourceDate: "2026-08-25",
          isDefault: false,
        },
        {
          companyId: 1,
          category: "Conductor",
          item: "14/2 NM-B cable",
          unit: "ft",
          unitCost: 0.91,
          supplier: "Northeast Electrical",
          manufacturer: "Wic.",
          manufacturerPartNumber: "WIC. ROMEX 14/2",
          supplierSku: "27892",
          sourceDate: "2026-08-25",
          isDefault: false,
        },
      ]);

      await seedEstimatorData(transaction as unknown as typeof db);
      const rows = await transaction.select().from(priceBookItemsTable);
      assert.equal(
        rows.find((row) => row.item === "12/2 NM-B cable")?.upc,
        "98010026305",
      );
      assert.equal(
        rows.find((row) => row.item === "14/2 NM-B cable")?.unitCost,
        0.91,
      );
      assert.equal(
        rows.find((row) => row.item === "14/2 NM-B cable")?.upc,
        null,
      );

      throw new RollbackFreshSeedTest();
    });
    assert.fail("Expected the UPC reconciliation transaction to roll back");
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