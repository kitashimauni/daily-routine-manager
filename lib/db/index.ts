import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDatabase = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>;
  database?: Database;
};

export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");

  if (!globalForDatabase.sqlClient) {
    globalForDatabase.sqlClient = postgres(url, {
      max: process.env.NODE_ENV === "development" ? 1 : 10,
      prepare: false,
    });
  }
  if (!globalForDatabase.database) globalForDatabase.database = drizzle(globalForDatabase.sqlClient, { schema });
  return globalForDatabase.database;
}
