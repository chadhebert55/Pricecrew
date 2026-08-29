import { pool } from "@workspace/db";

type Queryable = Pick<typeof pool, "query">;

export type ForeignKeyRequirement = {
  name: string;
  table: string;
  definition: string;
};

export type UniqueIndexRequirement = {
  name: string;
  table: string;
  definitionIncludes: string;
};

type ForeignKeyRow = {
  constraint_name: string;
  table_name: string;
  definition: string;
};

type IndexRow = {
  index_name: string;
  table_name: string;
  definition: string;
};

export const requiredTables = [
  "companies",
  "plan_takeoffs",
  "company_members",
  "company_settings",
  "customers",
  "price_book_items",
  "quotes",
  "proposal_decisions",
  "proposal_notifications",
  "takeoff_items",
  "takeoff_review_events",
] as const;

export const requiredForeignKeys: ForeignKeyRequirement[] = [
  {
    name: "plan_takeoffs_company_id_companies_id_fk",
    table: "plan_takeoffs",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "company_members_company_id_companies_id_fk",
    table: "company_members",
    definition:
      "FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE",
  },
  {
    name: "company_settings_company_id_companies_id_fk",
    table: "company_settings",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "customers_company_id_companies_id_fk",
    table: "customers",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "price_book_items_company_id_companies_id_fk",
    table: "price_book_items",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "quotes_company_id_companies_id_fk",
    table: "quotes",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "quotes_customer_id_customers_id_fk",
    table: "quotes",
    definition: "FOREIGN KEY (customer_id) REFERENCES customers(id)",
  },
  {
    name: "quotes_source_quote_id_quotes_id_fk",
    table: "quotes",
    definition: "FOREIGN KEY (source_quote_id) REFERENCES quotes(id)",
  },
  {
    name: "quotes_takeoff_id_plan_takeoffs_id_fk",
    table: "quotes",
    definition: "FOREIGN KEY (takeoff_id) REFERENCES plan_takeoffs(id)",
  },
  {
    name: "proposal_decisions_company_id_companies_id_fk",
    table: "proposal_decisions",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "proposal_decisions_quote_revision_fk",
    table: "proposal_decisions",
    definition:
      "FOREIGN KEY (quote_id, token_issued_at) REFERENCES quotes(id, updated_at)",
  },
  {
    name: "proposal_notifications_company_id_companies_id_fk",
    table: "proposal_notifications",
    definition: "FOREIGN KEY (company_id) REFERENCES companies(id)",
  },
  {
    name: "proposal_notifications_decision_fk",
    table: "proposal_notifications",
    definition:
      "FOREIGN KEY (proposal_decision_id) REFERENCES proposal_decisions(id) ON DELETE CASCADE",
  },
  {
    name: "takeoff_items_takeoff_id_plan_takeoffs_id_fk",
    table: "takeoff_items",
    definition:
      "FOREIGN KEY (takeoff_id) REFERENCES plan_takeoffs(id) ON DELETE CASCADE",
  },
  {
    name: "takeoff_review_events_takeoff_id_plan_takeoffs_id_fk",
    table: "takeoff_review_events",
    definition:
      "FOREIGN KEY (takeoff_id) REFERENCES plan_takeoffs(id) ON DELETE CASCADE",
  },
  {
    name: "takeoff_review_events_item_id_takeoff_items_id_fk",
    table: "takeoff_review_events",
    definition:
      "FOREIGN KEY (item_id) REFERENCES takeoff_items(id) ON DELETE CASCADE",
  },
];

export const requiredUniqueIndexes: UniqueIndexRequirement[] = [
  {
    name: "company_members_user_id_unique",
    table: "company_members",
    definitionIncludes: "USING btree (user_id)",
  },
  {
    name: "company_members_company_owner_unique",
    table: "company_members",
    definitionIncludes: "USING btree (company_id) WHERE (role = 'owner'::text)",
  },
  {
    name: "company_settings_company_id_unique",
    table: "company_settings",
    definitionIncludes: "USING btree (company_id)",
  },
  {
    name: "customers_company_normalized_email_unique",
    table: "customers",
    definitionIncludes:
      "USING btree (company_id, lower(NULLIF(btrim(email), ''::text)))",
  },
  {
    name: "quotes_id_updated_at_unique",
    table: "quotes",
    definitionIncludes: "USING btree (id, updated_at)",
  },
  {
    name: "quotes_company_quote_number_unique",
    table: "quotes",
    definitionIncludes: "USING btree (company_id, quote_number)",
  },
  {
    name: "proposal_decisions_quote_token_unique",
    table: "proposal_decisions",
    definitionIncludes: "USING btree (quote_id, token_issued_at)",
  },
  {
    name: "proposal_notifications_decision_unique",
    table: "proposal_notifications",
    definitionIncludes: "USING btree (proposal_decision_id)",
  },
];

export type DatabaseSchemaPreflightResult = {
  missingTables: string[];
  missingForeignKeys: string[];
  missingUniqueIndexes: string[];
};

function normalizeSql(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function formatMissingItems(label: string, items: string[]) {
  return items.length > 0
    ? `${label}:\n${items.map((item) => `  - ${item}`).join("\n")}`
    : "";
}

export async function inspectEstimatingSchema(
  client: Queryable,
): Promise<DatabaseSchemaPreflightResult> {
  const [tableResult, foreignKeyResult, indexResult] = await Promise.all([
    client.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name = ANY($1::text[])
      `,
      [requiredTables],
    ),
    client.query<ForeignKeyRow>(
      `
        SELECT
          conname AS constraint_name,
          conrelid::regclass::text AS table_name,
          pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE contype = 'f'
          AND connamespace = 'public'::regnamespace
          AND conname = ANY($1::text[])
      `,
      [requiredForeignKeys.map((foreignKey) => foreignKey.name)],
    ),
    client.query<IndexRow>(
      `
        SELECT
          indexname AS index_name,
          tablename AS table_name,
          indexdef AS definition
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
      `,
      [requiredUniqueIndexes.map((index) => index.name)],
    ),
  ]);

  const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
  const existingForeignKeys = new Map(
    foreignKeyResult.rows.map((row) => [
      row.constraint_name,
      {
        table: row.table_name,
        definition: normalizeSql(row.definition),
      },
    ]),
  );
  const existingIndexes = new Map(
    indexResult.rows.map((row) => [
      row.index_name,
      {
        table: row.table_name,
        definition: normalizeSql(row.definition),
      },
    ]),
  );

  return {
    missingTables: requiredTables.filter((table) => !existingTables.has(table)),
    missingForeignKeys: requiredForeignKeys
      .filter((foreignKey) => {
        const actual = existingForeignKeys.get(foreignKey.name);
        return (
          !actual ||
          actual.table !== foreignKey.table ||
          actual.definition !== normalizeSql(foreignKey.definition)
        );
      })
      .map((foreignKey) => `${foreignKey.table}.${foreignKey.name}`),
    missingUniqueIndexes: requiredUniqueIndexes
      .filter((index) => {
        const actual = existingIndexes.get(index.name);
        return (
          !actual ||
          actual.table !== index.table ||
          !actual.definition.startsWith("create unique index") ||
          !actual.definition.includes(normalizeSql(index.definitionIncludes))
        );
      })
      .map((index) => `${index.table}.${index.name}`),
  };
}

export function schemaPreflightError(result: DatabaseSchemaPreflightResult) {
  const missing = [
    formatMissingItems("Missing tables", result.missingTables),
    formatMissingItems("Missing foreign keys", result.missingForeignKeys),
    formatMissingItems("Missing unique indexes", result.missingUniqueIndexes),
  ].filter(Boolean);

  if (missing.length === 0) return null;

  return new Error(
    [
      "API database schema preflight failed: the development database is not synchronized with the Drizzle schema.",
      ...missing,
      "Run `pnpm --filter @workspace/db run push` against the development database. The dependency-aware sync creates referenced unique keys before dependent foreign keys.",
      "This preflight only ran read-only catalog queries; no database data was modified.",
    ].join("\n"),
  );
}

export async function assertEstimatingSchemaReady(client: Queryable = pool) {
  const result = await inspectEstimatingSchema(client);
  const error = schemaPreflightError(result);
  if (error) throw error;
}

if (process.argv[1]?.endsWith("database-schema-preflight.ts")) {
  try {
    await assertEstimatingSchemaReady();
    console.log("API database schema preflight passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
