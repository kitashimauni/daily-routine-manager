import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const priorityEnum = pgEnum("priority", ["required", "optional"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId), index("sessions_expires_at_idx").on(table.expiresAt)],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    ip: text("ip").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "string" }).notNull(),
    attempts: integer("attempts").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("auth_rate_limits_action_ip_idx").on(table.action, table.ip),
    index("auth_rate_limits_updated_at_idx").on(table.updatedAt),
  ],
);

export const routines = pgTable(
  "routines",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    priority: priorityEnum("priority").notNull(),
    daysOfWeek: integer("days_of_week").array().notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").notNull(),
    ...timestamps(),
  },
  (table) => [index("routines_user_id_idx").on(table.userId)],
);

export const routineRevisions = pgTable(
  "routine_revisions",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    priority: priorityEnum("priority").notNull(),
    daysOfWeek: integer("days_of_week").array().notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [index("routine_revisions_routine_id_idx").on(table.routineId), index("routine_revisions_start_date_idx").on(table.startDate)],
);

export const routineLogs = pgTable(
  "routine_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    routineId: text("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("routine_logs_routine_date_idx").on(table.routineId, table.date),
    index("routine_logs_user_id_date_idx").on(table.userId, table.date),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type AuthRateLimitRow = typeof authRateLimits.$inferSelect;
export type RoutineRow = typeof routines.$inferSelect;
export type RoutineRevisionRow = typeof routineRevisions.$inferSelect;
export type RoutineLogRow = typeof routineLogs.$inferSelect;
