import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL environment variable");
}

const sslMode = (process.env.DB_SSL || process.env.SUPABASE_DB_SSL || "disable").toLowerCase();
const sslConfig = sslMode === "disable" ? false : { rejectUnauthorized: false };

const poolInstance = new Pool({
  connectionString,
  ssl: sslConfig,
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 30000),
});

const RETRY_ATTEMPTS = Number(process.env.DB_RETRY_ATTEMPTS || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.DB_RETRY_BASE_DELAY_MS || 300);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDbError = (error) => {
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "etimedout" ||
    code === "econnreset" ||
    code === "enetunreach" ||
    code === "econnrefused"
  );
};

const withRetry = async (operation) => {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < RETRY_ATTEMPTS && isTransientDbError(error);

      if (!shouldRetry) {
        throw error;
      }

      await wait(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError;
};

const isBulkRows = (value) => Array.isArray(value) && value.length > 0 && Array.isArray(value[0]);

const normalizeResult = (result) => {
  if (typeof result.rowCount === "number") {
    result.affectedRows = result.rowCount;
  }
  if (result.command === "INSERT" && result.rows?.length && Object.prototype.hasOwnProperty.call(result.rows[0], "id")) {
    result.insertId = result.rows[0].id;
  }
  return result;
};

const prepareQuery = (sql, params = []) => {
  if (!params || params.length === 0) {
    return { text: sql, values: [] };
  }

  const values = [];
  let paramIndex = 0;

  const text = sql.replace(/\?/g, () => {
    if (paramIndex >= params.length) {
      throw new Error("Not enough parameters supplied for SQL query");
    }

    const value = params[paramIndex++];

    if (isBulkRows(value)) {
      const columnCount = value[0].length;
      return value
        .map((row) => {
          if (!Array.isArray(row) || row.length !== columnCount) {
            throw new Error("Bulk insert rows must all have the same length");
          }
          const placeholders = row.map((col) => {
            values.push(col);
            return `$${values.length}`;
          });
          return `(${placeholders.join(", ")})`;
        })
        .join(", ");
    }

    values.push(value);
    return `$${values.length}`;
  });

  if (paramIndex < params.length) {
    throw new Error("Too many parameters supplied for SQL query");
  }

  return { text, values };
};

const run = async (executor, sql, params = []) => {
  const { text, values } = prepareQuery(sql, params);
  const result = await withRetry(() => executor.query(text, values));
  const normalized = normalizeResult(result);
  // Attach insertId to the rows array so `const [result] = pool.execute(...)` → result.insertId works
  if (normalized.insertId !== undefined) {
    result.rows.insertId = normalized.insertId;
  }
  result.rows.affectedRows = normalized.affectedRows;
  return [result.rows, normalized];
};

const pool = {
  query: (sql, params) => run(poolInstance, sql, params),
  execute: (sql, params) => run(poolInstance, sql, params),
  getConnection: async () => {
    const client = await withRetry(() => poolInstance.connect());
    const runner = (sql, params) => run(client, sql, params);
    return {
      query: runner,
      execute: runner,
      beginTransaction: () => client.query("BEGIN"),
      commit: () => client.query("COMMIT"),
      rollback: () => client.query("ROLLBACK"),
      release: () => client.release(),
    };
  },
};

export default pool;
