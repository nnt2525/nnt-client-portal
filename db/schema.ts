import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Better Auth's standard schema. Auth dates use Date objects; product dates below
// are UTC ISO strings, with date-only deadlines kept in YYYY-MM-DD form.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false), image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const session = sqliteTable("session", {
  id: text("id").primaryKey(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_idx").on(t.userId)]);
export const account = sqliteTable("account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }), refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"), password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("account_user_idx").on(t.userId), uniqueIndex("account_provider_idx").on(t.providerId, t.accountId)]);
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }), updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(), key: text("key").notNull().unique(),
  count: integer("count").notNull(), lastRequest: integer("last_request").notNull(),
});
export const requestLimits = sqliteTable("request_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), resetAt: integer("reset_at").notNull(),
});
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }), createdAt: text("created_at").notNull(),
}, (t) => [index("workspace_owner_idx").on(t.ownerId)]);
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(), clientName: text("client_name").notNull(), clientEmail: text("client_email").notNull(),
  service: text("service").notNull(), description: text("description").notNull(), budgetCents: integer("budget_cents").notNull(), currency: text("currency").notNull().default("THB"),
  dueDate: text("due_date").notNull(), status: text("status").notNull().default("discovery"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [index("project_workspace_idx").on(t.workspaceId)]);
export const projectMembers = sqliteTable("project_members", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("member_user_idx").on(t.userId)]);
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(), status: text("status").notNull().default("todo"), dueDate: text("due_date").notNull().default(""), createdAt: text("created_at").notNull(),
}, (t) => [index("task_project_idx").on(t.projectId)]);
export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(), dueDate: text("due_date").notNull().default(""), status: text("status").notNull().default("pending"), createdAt: text("created_at").notNull(),
}, (t) => [index("milestone_project_idx").on(t.projectId)]);
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id), authorName: text("author_name").notNull(), body: text("body").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("comment_project_idx").on(t.projectId)]);
export const projectFiles = sqliteTable("project_files", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), name: text("name").notNull(),
  size: integer("size").notNull(), contentType: text("content_type").notNull(), objectKey: text("object_key").notNull().unique(), state: text("state").notNull().default("pending"),
  uploaderId: text("uploader_id").notNull().references(() => user.id), uploaderName: text("uploader_name").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("file_project_idx").on(t.projectId)]);
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  actorName: text("actor_name").notNull(), action: text("action").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("activity_project_idx").on(t.projectId, t.createdAt)]);
export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(), tokenHash: text("token_hash").notNull().unique(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), expiresAt: text("expires_at").notNull(),
  consumedBy: text("consumed_by").references(() => user.id), consumedAt: text("consumed_at"), createdAt: text("created_at").notNull(),
}, (t) => [index("invite_project_idx").on(t.projectId)]);
