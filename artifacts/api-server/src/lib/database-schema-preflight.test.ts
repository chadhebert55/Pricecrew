import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectEstimatingSchema,
  requiredForeignKeys,
  requiredColumns,
  requiredTables,
  requiredUniqueIndexes,
  schemaPreflightError,
} from "./database-schema-preflight";

type Catalog = {
  tables: Array<{ table_name: string }>;
  columns: Array<{ table_name: string; column_name: string }>;
  foreignKeys: Array<{
    constraint_name: string;
    table_name: string;
    definition: string;
  }>;
  indexes: Array<{
    index_name: string;
    table_name: string;
    definition: string;
  }>;
};

function synchronizedCatalog(): Catalog {
  return {
    tables: requiredTables.map((table_name) => ({ table_name })),
    columns: requiredColumns.map((column) => ({
      table_name: column.table,
      column_name: column.column,
    })),
    foreignKeys: requiredForeignKeys.map((foreignKey) => ({
      constraint_name: foreignKey.name,
      table_name: foreignKey.table,
      definition: foreignKey.definition,
    })),
    indexes: requiredUniqueIndexes.map((index) => ({
      index_name: index.name,
      table_name: index.table,
      definition: `CREATE UNIQUE INDEX ${index.name} ON public.${index.table} ${index.definitionIncludes}`,
    })),
  };
}

function catalogClient(catalog: Catalog) {
  const queries: string[] = [];
  const query = async (statement: string) => {
    queries.push(statement);

    if (statement.includes("information_schema.tables")) {
      return { rows: catalog.tables };
    }
    if (statement.includes("information_schema.columns")) {
      return { rows: catalog.columns };
    }
    if (statement.includes("pg_constraint")) {
      return { rows: catalog.foreignKeys };
    }
    if (statement.includes("pg_indexes")) {
      return { rows: catalog.indexes };
    }
    throw new Error(`Unexpected catalog query: ${statement}`);
  };

  return {
    client: { query } as unknown as Parameters<
      typeof inspectEstimatingSchema
    >[0],
    queries,
  };
}

test("accepts a synchronized schema using only catalog SELECT queries", async () => {
  const { client, queries } = catalogClient(synchronizedCatalog());

  const result = await inspectEstimatingSchema(client);

  assert.deepEqual(result, {
    missingTables: [],
    missingColumns: [],
    missingForeignKeys: [],
    missingUniqueIndexes: [],
  });
  assert.equal(queries.length, 4);
  for (const query of queries) {
    assert.match(query.trim(), /^SELECT\b/i);
  }
});

test("reports missing company trade/onboarding persistence columns", async () => {
  const catalog = synchronizedCatalog();
  catalog.columns = catalog.columns.filter(
    (column) => column.column_name !== "onboarding_completed",
  );

  const result = await inspectEstimatingSchema(catalogClient(catalog).client);
  assert.deepEqual(result.missingColumns, ["companies.onboarding_completed"]);
});

test("reports a missing required table with schema-sync guidance", async () => {
  const catalog = synchronizedCatalog();
  catalog.tables = catalog.tables.filter(
    (row) => row.table_name !== "plan_takeoffs",
  );

  const result = await inspectEstimatingSchema(catalogClient(catalog).client);
  const error = schemaPreflightError(result);

  assert.deepEqual(result.missingTables, ["plan_takeoffs"]);
  assert.match(
    error?.message ?? "",
    /development database is not synchronized/i,
  );
  assert.match(error?.message ?? "", /pnpm --filter @workspace\/db run push/);
  assert.match(error?.message ?? "", /read-only catalog queries/i);
});

test("reports a missing or incorrect required foreign key", async () => {
  const catalog = synchronizedCatalog();
  const foreignKey = catalog.foreignKeys.find(
    (row) => row.constraint_name === "quotes_takeoff_id_plan_takeoffs_id_fk",
  );
  assert.ok(foreignKey);
  foreignKey.definition =
    "FOREIGN KEY (takeoff_id) REFERENCES plan_takeoffs(id) ON DELETE CASCADE";

  const result = await inspectEstimatingSchema(catalogClient(catalog).client);

  assert.deepEqual(result.missingForeignKeys, [
    "quotes.quotes_takeoff_id_plan_takeoffs_id_fk",
  ]);
});

test("reports an index that exists without the required unique definition", async () => {
  const catalog = synchronizedCatalog();
  const index = catalog.indexes.find(
    (row) => row.index_name === "quotes_company_quote_number_unique",
  );
  assert.ok(index);
  index.definition =
    "CREATE INDEX quotes_company_quote_number_unique ON public.quotes USING btree (company_id, quote_number)";

  const result = await inspectEstimatingSchema(catalogClient(catalog).client);

  assert.deepEqual(result.missingUniqueIndexes, [
    "quotes.quotes_company_quote_number_unique",
  ]);
});
