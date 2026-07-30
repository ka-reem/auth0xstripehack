import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const scanJobs = sqliteTable(
  "scan_jobs",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    source: text("source").notNull(),
    query: text("search_query").notNull(),
    sourceType: text("source_type").notNull(),
    status: text("status").notNull(),
    progress: integer("progress").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    sourceMetadata: text("source_metadata").notNull(),
    providers: text("providers").notNull(),
    matches: text("matches").notNull(),
    notice: text("notice").notNull(),
    error: text("error"),
  },
  (table) => [
    index("scan_jobs_owner_created_idx").on(table.ownerKey, table.createdAt),
    index("scan_jobs_status_idx").on(table.status),
  ],
);

export const scanReviews = sqliteTable(
  "scan_reviews",
  {
    scanId: text("scan_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    matchId: text("match_id").notNull(),
    decision: text("decision").notNull(),
    note: text("note").notNull().default(""),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scanId, table.ownerKey, table.matchId],
    }),
    index("scan_reviews_owner_scan_idx").on(table.ownerKey, table.scanId),
  ],
);
