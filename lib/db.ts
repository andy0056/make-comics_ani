import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import "../envConfig.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const databaseUrl = process.env.DATABASE_URL;

function isLocalPostgresUrl(urlString: string): boolean {
  try {
    const parsedUrl = new URL(urlString);
    return ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

const useNodePgDriver = isLocalPostgresUrl(databaseUrl);

let dbInstance: ReturnType<typeof drizzleNeon>;

if (useNodePgDriver) {
  type GlobalPool = typeof globalThis & { __makeComicsPgPool?: Pool };
  const globalForPool = globalThis as GlobalPool;

  const pool =
    globalForPool.__makeComicsPgPool ??
    new Pool({ connectionString: databaseUrl });

  if (process.env.NODE_ENV !== "production") {
    globalForPool.__makeComicsPgPool = pool;
  }

  // Cast keeps downstream imports stable while allowing local node-postgres usage.
  dbInstance = drizzleNodePg(pool) as unknown as ReturnType<typeof drizzleNeon>;
} else {
  const sql = neon(databaseUrl);
  dbInstance = drizzleNeon(sql);
}

export const db = dbInstance;
