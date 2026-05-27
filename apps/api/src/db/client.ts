import pg from "pg";
import { resolvePgPoolConfig } from "./ssl.js";

export type Db = {
  pool: pg.Pool;
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>>;
  transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  connect(): Promise<void>;
  end(): Promise<void>;
};

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool(resolvePgPoolConfig(connectionString));

  return {
    pool,
    query(text, params) {
      return pool.query(text, params);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async connect() {
      const client = await pool.connect();
      client.release();
    },
    end() {
      return pool.end();
    }
  };
}

export function queryClient<T extends pg.QueryResultRow = pg.QueryResultRow>(
  client: pg.Pool | pg.PoolClient,
  text: string,
  params?: unknown[]
) {
  return client.query<T>(text, params);
}
