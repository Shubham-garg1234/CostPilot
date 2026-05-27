import type { PoolConfig } from "pg";

const SSL_QUERY_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"] as const;

/**
 * pg 8.x + pg-connection-string treat `sslmode=require` in the URL as strict verify-full,
 * which breaks many Supabase / managed-Postgres setups on Windows (SELF_SIGNED_CERT_IN_CHAIN).
 * Strip SSL params from the URL and pass explicit `ssl` to the pool instead.
 */
export function resolvePgPoolConfig(connectionString: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString };
  }

  const sslmode = url.searchParams.get("sslmode") ?? process.env.PGSSLMODE ?? undefined;

  for (const param of SSL_QUERY_PARAMS) {
    url.searchParams.delete(param);
  }

  const cleanedConnectionString = url.toString();

  if (!sslmode || sslmode === "disable") {
    return { connectionString: cleanedConnectionString };
  }

  const strictVerification =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "1";

  if (strictVerification && sslmode !== "no-verify") {
    return { connectionString: cleanedConnectionString, ssl: true };
  }

  return {
    connectionString: cleanedConnectionString,
    ssl: { rejectUnauthorized: false }
  };
}
