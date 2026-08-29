import { spawnSync } from "node:child_process";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const referencedUniqueKeys = [
  {
    table: "quotes",
    constraint: "quotes_id_updated_at_unique",
    columns: ["id", "updated_at"],
  },
];

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function prepareReferencedUniqueKey(client, requirement) {
  const { table, constraint, columns } = requirement;
  const relation = await client.query(`SELECT to_regclass($1) AS relation`, [
    `public.${table}`,
  ]);
  if (!relation.rows[0]?.relation) return;

  const duplicateResult = await client.query(
    `
      SELECT 1
      FROM ${quoteIdentifier("public")}.${quoteIdentifier(table)}
      GROUP BY ${columns.map(quoteIdentifier).join(", ")}
      HAVING count(*) > 1
      LIMIT 1
    `,
  );
  if (duplicateResult.rowCount) {
    throw new Error(
      `Cannot create ${constraint}: ${table} contains duplicate (${columns.join(", ")}) values. No data was changed.`,
    );
  }

  const constraintResult = await client.query(
    `
      SELECT 1
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid = $1::regclass
        AND conname = $2
        AND contype = 'u'
    `,
    [`public.${table}`, constraint],
  );
  if (constraintResult.rowCount) return;

  const indexResult = await client.query(
    `
      SELECT
        i.indisunique,
        i.indisvalid,
        array_agg(a.attname::text ORDER BY key_columns.ordinality)::text[] AS columns
      FROM pg_index i
      JOIN pg_class index_class ON index_class.oid = i.indexrelid
      JOIN pg_class table_class ON table_class.oid = i.indrelid
      JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
      JOIN unnest(i.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
        ON key_columns.ordinality <= i.indnkeyatts
      JOIN pg_attribute a
        ON a.attrelid = table_class.oid
       AND a.attnum = key_columns.attnum
      WHERE namespace.nspname = 'public'
        AND table_class.relname = $1
        AND index_class.relname = $2
      GROUP BY i.indisunique, i.indisvalid
    `,
    [table, constraint],
  );

  if (indexResult.rowCount) {
    const index = indexResult.rows[0];
    if (
      !index.indisunique ||
      !index.indisvalid ||
      JSON.stringify(index.columns) !== JSON.stringify(columns)
    ) {
      throw new Error(
        `Cannot safely synchronize ${constraint}: an incompatible index with that name already exists. No data was changed.`,
      );
    }
  } else {
    await client.query(
      `CREATE UNIQUE INDEX ${quoteIdentifier(constraint)}
       ON ${quoteIdentifier("public")}.${quoteIdentifier(table)}
       (${columns.map(quoteIdentifier).join(", ")})`,
    );
  }

  await client.query(
    `ALTER TABLE ${quoteIdentifier("public")}.${quoteIdentifier(table)}
     ADD CONSTRAINT ${quoteIdentifier(constraint)}
     UNIQUE USING INDEX ${quoteIdentifier(constraint)}`,
  );
}

async function prepareDependencies() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL, ensure the database is provisioned");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('electrical-estimator-schema-push'))",
    );
    await client.query("BEGIN");
    for (const requirement of referencedUniqueKeys) {
      await prepareReferencedUniqueKey(client, requirement);
    }
    await client.query("COMMIT");
    return client;
  } catch (error) {
    await client.query("ROLLBACK");
    await client.end();
    throw error;
  }
}

const lockClient = await prepareDependencies();

try {
  const drizzleKit = new URL(
    "../node_modules/drizzle-kit/bin.cjs",
    import.meta.url,
  );
  const result = spawnSync(
    process.execPath,
    [
      drizzleKit.pathname,
      "push",
      "--config",
      "./drizzle.config.ts",
      ...(process.argv.includes("--force") ? ["--force"] : []),
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await lockClient.query(
    "SELECT pg_advisory_unlock(hashtext('electrical-estimator-schema-push'))",
  );
  await lockClient.end();
}
