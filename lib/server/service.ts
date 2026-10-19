import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import type { Bootstrap, Project, ProjectDetail, ProjectFile, PortalUser, Role, Workspace } from "@/lib/contracts";
import { createAuth } from "./auth";
import { HttpError, json, readBounded, readJson, sameOrigin } from "./http";
import * as v from "./validation";

type Db = ReturnType<typeof getDb>;
type Actor = PortalUser;
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const MAX_FILE = 8 * 1024 * 1024;
const MAX_PROJECT_FILES = 20;
const MAX_PROJECT_BYTES = 40 * 1024 * 1024;

async function getActor(request: Request): Promise<Actor | null> {
  const session = await createAuth(request).api.getSession({ headers: request.headers });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}
async function requireActor(request: Request) {
  const actor = await getActor(request);
  if (!actor) throw new HttpError(401, "Sign in to continue.");
  return actor;
}
async function access(db: Db, projectId: string, actor: Actor, ownerOnly = false) {
  const [row] = await db.select({ project: s.projects, ownerId: s.workspaces.ownerId }).from(s.projects)
    .innerJoin(s.workspaces, eq(s.projects.workspaceId, s.workspaces.id)).where(eq(s.projects.id, projectId)).limit(1);
  if (!row) throw new HttpError(404, "Project not found.");
  const role: Role = row.ownerId === actor.id ? "owner" : "client";
  if (role === "client") {
    const [membership] = await db.select({ userId: s.projectMembers.userId }).from(s.projectMembers)
      .where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.userId, actor.id))).limit(1);
    if (!membership) throw new HttpError(404, "Project not found.");
    if (ownerOnly) throw new HttpError(403, "Only the workspace owner can do this.");
  }
  return { ...row, role };
}
// Keep the outer identifier explicit: Drizzle removes table qualifiers in a
// single-table selection, which would make `id` bind to the inner tasks table.
const taskCount = sql<number>`(SELECT count(*) FROM tasks WHERE tasks.project_id = "projects"."id")`.mapWith(Number);
const completedTasks = sql<number>`(SELECT count(*) FROM tasks WHERE tasks.project_id = "projects"."id" AND tasks.status = 'done')`.mapWith(Number);
function projectView(row: { project: typeof s.projects.$inferSelect; taskCount: number; completedTasks: number }): Project {
  return { ...row.project, status: row.project.status as Project["status"], taskCount: row.taskCount, completedTasks: row.completedTasks,
    progress: row.taskCount ? Math.round(row.completedTasks / row.taskCount * 100) : row.project.status === "completed" ? 100 : 0 };
}
async function projectById(db: Db, projectId: string) {
  const [row] = await db.select({ project: s.projects, taskCount, completedTasks }).from(s.projects).where(eq(s.projects.id, projectId));
  return projectView(row);
}
function fileView(file: typeof s.projectFiles.$inferSelect): ProjectFile {
  return { id: file.id, projectId: file.projectId, name: file.name, size: file.size, contentType: file.contentType,
    uploaderName: file.uploaderName, createdAt: file.createdAt };
}
function event(projectId: string, actor: Actor, action: string) {
  return { id: id(), projectId, actorName: actor.name, action, createdAt: now() };
}
async function bootstrap(db: Db, actor: Actor | null): Promise<Bootstrap> {
  if (!actor) return { user: null, workspaces: [], projects: [] };
  const rows = await db.select({ project: s.projects, taskCount, completedTasks }).from(s.projects)
    .innerJoin(s.workspaces, eq(s.projects.workspaceId, s.workspaces.id))
    .where(sql`${s.workspaces.ownerId} = ${actor.id} OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = ${s.projects.id} AND project_members.user_id = ${actor.id})`)
    .orderBy(desc(s.projects.updatedAt)).limit(500);
  const owned = await db.select({ id: s.workspaces.id, name: s.workspaces.name }).from(s.workspaces).where(eq(s.workspaces.ownerId, actor.id));
  const workspaces: Workspace[] = owned.map((workspace) => ({ ...workspace, role: "owner" }));
  const visibleIds = [...new Set(rows.map((row) => row.project.workspaceId))].filter((workspaceId) => !owned.some((workspace) => workspace.id === workspaceId));
  if (visibleIds.length) {
    const joined = await db.select({ id: s.workspaces.id, name: s.workspaces.name }).from(s.workspaces).where(inArray(s.workspaces.id, visibleIds));
    workspaces.push(...joined.map((workspace) => ({ ...workspace, role: "client" as const })));
  }
  return { user: actor, workspaces, projects: rows.map(projectView) };
}
async function detail(db: Db, projectId: string, actor: Actor): Promise<ProjectDetail> {
  const { role } = await access(db, projectId, actor);
  const [project, tasks, milestones, comments, files, activity] = await Promise.all([
    projectById(db, projectId),
    db.select().from(s.tasks).where(eq(s.tasks.projectId, projectId)).orderBy(s.tasks.createdAt),
    db.select().from(s.milestones).where(eq(s.milestones.projectId, projectId)).orderBy(s.milestones.createdAt),
    db.select().from(s.comments).where(eq(s.comments.projectId, projectId)).orderBy(desc(s.comments.createdAt), desc(s.comments.id)).limit(500),
    db.select().from(s.projectFiles).where(and(eq(s.projectFiles.projectId, projectId), eq(s.projectFiles.state, "ready"))).orderBy(desc(s.projectFiles.createdAt)),
    db.select().from(s.activities).where(eq(s.activities.projectId, projectId)).orderBy(desc(s.activities.createdAt)).limit(100),
  ]);
  return { project, role, tasks: tasks as ProjectDetail["tasks"], milestones: milestones as ProjectDetail["milestones"], comments: comments.reverse(),
    files: files.map(fileView), activity };
}

async function createWorkspace(db: Db, actor: Actor, name: string): Promise<Workspace> {
  const workspace = { id: id(), name, ownerId: actor.id, createdAt: now() };
  const result = await env.DB!.prepare(`INSERT INTO workspaces (id,name,owner_id,created_at)
    SELECT ?,?,?,? WHERE (SELECT count(*) FROM workspaces WHERE owner_id = ?) < 10 RETURNING id`)
    .bind(workspace.id, name, actor.id, workspace.createdAt, actor.id).all();
  if (!result.results.length) throw new HttpError(409, "This account has reached the 10-workspace limit.");
  return { id: workspace.id, name, role: "owner" };
}

async function createProject(request: Request, db: Db, actor: Actor) {
  const input = await readJson(request, v.projectInput);
  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, input.workspaceId)).limit(1);
  if (!workspace || workspace.ownerId !== actor.id) throw new HttpError(404, "Workspace not found.");
  const project = { ...input, id: id(), currency: "THB", status: "discovery", createdAt: now(), updatedAt: now() };
  const created = await env.DB!.prepare(`INSERT INTO projects
    (id,workspace_id,title,client_name,client_email,service,description,budget_cents,currency,due_date,status,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM projects WHERE workspace_id = ?) < 100 RETURNING id`)
    .bind(project.id, project.workspaceId, project.title, project.clientName, project.clientEmail, project.service, project.description,
      project.budgetCents, project.currency, project.dueDate, project.status, project.createdAt, project.updatedAt, workspace.id).all();
  if (!created.results.length) throw new HttpError(409, "This workspace has reached the 100-project limit.");
  await db.batch([
    db.insert(s.milestones).values([
      { id: id(), projectId: project.id, title: "Brief & direction", dueDate: input.dueDate, status: "pending", createdAt: now() },
      { id: id(), projectId: project.id, title: "Design & development", dueDate: input.dueDate, status: "pending", createdAt: now() },
      { id: id(), projectId: project.id, title: "Review & handover", dueDate: input.dueDate, status: "pending", createdAt: now() },
    ]),
    db.insert(s.activities).values(event(project.id, actor, "Created the project and shared the brief")),
  ]);
  return json(await projectById(db, project.id), 201);
}
async function patchProject(request: Request, db: Db, actor: Actor, projectId: string) {
  await access(db, projectId, actor, true);
  const input = await readJson(request, v.projectPatch);
  await db.batch([
    db.update(s.projects).set({ ...input, updatedAt: now() }).where(eq(s.projects.id, projectId)),
    db.insert(s.activities).values(event(projectId, actor, input.status ? `Moved project to ${input.status.replaceAll("_", " ")}` : "Updated the project brief")),
  ]);
  return json(await projectById(db, projectId));
}
async function makeInvite(db: Db, actor: Actor, projectId: string) {
  await access(db, projectId, actor, true);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hash(token);
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  await db.insert(s.invites).values({ id: id(), projectId, tokenHash, expiresAt, createdAt: now() });
  return json({ token, expiresAt }, 201);
}
async function hash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function redeemInvite(request: Request, db: Db, actor: Actor) {
  const { token } = await readJson(request, v.tokenInput);
  const tokenHash = await hash(token); const stamp = now();
  // D1 batch is a transaction. Both the membership grant and token consumption
  // use the same unconsumed predicate; concurrent redemptions cannot share it.
  const results = await env.DB!.batch([
    env.DB!.prepare(`INSERT INTO project_members (project_id, user_id, created_at)
      SELECT project_id, ?, ? FROM invites WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      ON CONFLICT (project_id, user_id) DO NOTHING`).bind(actor.id, stamp, tokenHash, stamp),
    env.DB!.prepare(`UPDATE invites SET consumed_by = ?, consumed_at = ?
      WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING project_id`).bind(actor.id, stamp, tokenHash, stamp),
  ]);
  const row = results[1].results[0] as { project_id: string } | undefined;
  if (!row) throw new HttpError(409, "This invitation has expired or has already been used.");
  await db.insert(s.activities).values(event(row.project_id, actor, "Joined the project as a client"));
  return json({ projectId: row.project_id });
}
async function createTask(request: Request, db: Db, actor: Actor, projectId: string) {
  await access(db, projectId, actor, true);
  const input = await readJson(request, v.itemInput);
  const task = { ...input, id: id(), projectId, status: "todo", dueDate: input.dueDate || "", createdAt: now() };
  await db.batch([db.insert(s.tasks).values(task), db.insert(s.activities).values(event(projectId, actor, `Added task: ${task.title}`)),
    db.update(s.projects).set({ updatedAt: now() }).where(eq(s.projects.id, projectId))]);
  return json(task, 201);
}
async function patchTask(request: Request, db: Db, actor: Actor, taskId: string) {
  const [task] = await db.select().from(s.tasks).where(eq(s.tasks.id, taskId)).limit(1);
  if (!task) throw new HttpError(404, "Task not found.");
  await access(db, task.projectId, actor, true);
  const { status } = await readJson(request, v.taskPatch);
  await db.batch([
    db.update(s.tasks).set({ status }).where(eq(s.tasks.id, taskId)),
    db.insert(s.activities).values(event(task.projectId, actor, `${status === "done" ? "Completed" : "Updated"} task: ${task.title}`)),
    db.update(s.projects).set({ updatedAt: now() }).where(eq(s.projects.id, task.projectId)),
  ]);
  return json({ ...task, status });
}
async function createMilestone(request: Request, db: Db, actor: Actor, projectId: string) {
  await access(db, projectId, actor, true);
  const input = await readJson(request, v.itemInput);
  const milestone = { ...input, id: id(), projectId, status: "pending", dueDate: input.dueDate || "", createdAt: now() };
  await db.batch([db.insert(s.milestones).values(milestone), db.insert(s.activities).values(event(projectId, actor, `Added milestone: ${milestone.title}`))]);
  return json(milestone, 201);
}
async function patchMilestone(request: Request, db: Db, actor: Actor, milestoneId: string) {
  const [milestone] = await db.select().from(s.milestones).where(eq(s.milestones.id, milestoneId)).limit(1);
  if (!milestone) throw new HttpError(404, "Milestone not found.");
  const { role } = await access(db, milestone.projectId, actor);
  const { status } = await readJson(request, v.milestonePatch);
  if (role === "owner" && status === "approved") throw new HttpError(403, "Client approval must come from a project client.");
  if (role === "client" && status !== "approved") throw new HttpError(403, "Clients can approve ready milestones only.");
  if (role === "client" && milestone.status !== "ready") throw new HttpError(409, "Only a ready milestone can be approved.");
  if (role === "owner" && milestone.status === "approved") throw new HttpError(409, "An approved milestone cannot be changed.");
  const changed = await db.update(s.milestones).set({ status })
    .where(and(eq(s.milestones.id, milestoneId), eq(s.milestones.status, milestone.status))).returning();
  if (!changed.length) throw new HttpError(409, "The milestone changed. Refresh and try again.");
  await db.insert(s.activities).values(event(milestone.projectId, actor, `${status === "approved" ? "Approved" : "Updated"} milestone: ${milestone.title}`));
  return json(changed[0]);
}
async function createComment(request: Request, db: Db, actor: Actor, projectId: string) {
  await access(db, projectId, actor);
  const { body } = await readJson(request, v.commentInput);
  const comment = { id: id(), projectId, authorId: actor.id, authorName: actor.name, body, createdAt: now() };
  await db.batch([db.insert(s.comments).values(comment), db.insert(s.activities).values(event(projectId, actor, "Left project feedback")),
    db.update(s.projects).set({ updatedAt: now() }).where(eq(s.projects.id, projectId))]);
  return json(comment, 201);
}

function validatedFile(file: File, bytes: Uint8Array): { name: string; contentType: string } {
  const name = file.name.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 160);
  if (!name || name === "." || name === "..") throw new HttpError(400, "Choose a valid file name.");
  const extension = name.split(".").at(-1)?.toLowerCase();
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  let contentType = "";
  if (extension === "pdf" && ascii(0, 5) === "%PDF-") contentType = "application/pdf";
  if (extension === "png" && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) contentType = "image/png";
  if (["jpg", "jpeg"].includes(extension || "") && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) contentType = "image/jpeg";
  if (extension === "webp" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") contentType = "image/webp";
  if (extension === "txt") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) contentType = "text/plain; charset=utf-8";
    } catch { /* Invalid UTF-8 is not a plain text attachment. */ }
  }
  if (!contentType) throw new HttpError(415, "Supported files: PDF, PNG, JPEG, WebP and UTF-8 TXT. The file contents must match its extension.");
  return { name, contentType };
}
async function upload(request: Request, db: Db, actor: Actor, projectId: string) {
  await access(db, projectId, actor);
  if (!env.BUCKET) throw new HttpError(503, "File storage is unavailable.");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;")) throw new HttpError(415, "Send a multipart file upload.");
  const raw = await readBounded(request, MAX_FILE + 64 * 1024);
  let form: FormData;
  try { form = await new Response(raw.buffer as ArrayBuffer, { headers: { "content-type": contentType } }).formData(); }
  catch { throw new HttpError(400, "Invalid file upload."); }
  const fields = [...form.keys()]; const file = form.get("file");
  if (fields.length !== 1 || fields[0] !== "file" || !file || typeof file === "string") throw new HttpError(400, "Upload exactly one file in the file field.");
  if (!file.size || file.size > MAX_FILE) throw new HttpError(413, "Choose a non-empty file up to 8 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = validatedFile(file, bytes); const fileId = id();
  const record = { id: fileId, projectId, ...valid, size: bytes.length, objectKey: `projects/${projectId}/${fileId}`,
    state: "pending", uploaderId: actor.id, uploaderName: actor.name, createdAt: now() };
  // A single SQL statement atomically reserves quota, including in-flight files.
  const reservation = await env.DB!.prepare(`INSERT INTO project_files
    (id,project_id,name,size,content_type,object_key,state,uploader_id,uploader_name,created_at)
    SELECT ?,?,?,?,?,?,'pending',?,?,? WHERE
    (SELECT count(*) FROM project_files WHERE project_id = ?) < ? AND
    (SELECT coalesce(sum(size),0) FROM project_files WHERE project_id = ?) + ? <= ? RETURNING id`)
    .bind(record.id, projectId, record.name, record.size, record.contentType, record.objectKey, actor.id, actor.name, record.createdAt,
      projectId, MAX_PROJECT_FILES, projectId, record.size, MAX_PROJECT_BYTES).all();
  if (!reservation.results.length) throw new HttpError(409, "Project storage is full: at most 20 files and 40 MiB total.");
  try {
    await env.BUCKET.put(record.objectKey, bytes, { httpMetadata: { contentType: valid.contentType } });
    await db.batch([
      db.update(s.projectFiles).set({ state: "ready" }).where(eq(s.projectFiles.id, fileId)),
      db.insert(s.activities).values(event(projectId, actor, `Uploaded ${record.name}`)),
    ]);
  } catch (error) {
    await env.BUCKET.delete(record.objectKey).catch(() => undefined);
    await db.delete(s.projectFiles).where(eq(s.projectFiles.id, fileId));
    throw error;
  }
  return json(fileView({ ...record, state: "ready" }), 201);
}
async function download(db: Db, actor: Actor, fileId: string) {
  const [file] = await db.select().from(s.projectFiles).where(and(eq(s.projectFiles.id, fileId), eq(s.projectFiles.state, "ready"))).limit(1);
  if (!file) throw new HttpError(404, "File not found.");
  await access(db, file.projectId, actor);
  if (!env.BUCKET) throw new HttpError(503, "File storage is unavailable.");
  const object = await env.BUCKET.get(file.objectKey);
  if (!object) throw new HttpError(404, "File not found.");
  const asciiName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/"/g, "_");
  return new Response(object.body, { headers: {
    "Content-Type": file.contentType, "Content-Length": String(file.size),
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
  } });
}
async function deleteFile(db: Db, actor: Actor, fileId: string) {
  const [file] = await db.select().from(s.projectFiles).where(eq(s.projectFiles.id, fileId)).limit(1);
  if (!file) throw new HttpError(404, "File not found.");
  await access(db, file.projectId, actor, true);
  if (!env.BUCKET) throw new HttpError(503, "File storage is unavailable.");
  await env.BUCKET.delete(file.objectKey);
  await db.batch([db.delete(s.projectFiles).where(eq(s.projectFiles.id, fileId)), db.insert(s.activities).values(event(file.projectId, actor, `Removed ${file.name}`))]);
  return json({ ok: true });
}

async function demo(request: Request, db: Db) {
  const stampMs = Date.now();
  // Cloudflare supplies this header; forwarded headers are deliberately ignored.
  // Local preview shares the fallback budget. Store a digest rather than raw IPs.
  const key = `demo:${await hash(request.headers.get("cf-connecting-ip") || "local-preview")}`;
  const limit = await env.DB!.prepare(`INSERT INTO request_limits (key,count,reset_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    WHERE reset_at <= ? OR count < 6 RETURNING count`)
    .bind(key, stampMs + 10 * 60_000, stampMs, stampMs, stampMs).all();
  if (!limit.results.length) throw new HttpError(429, "Demo limit reached. Try again in 10 minutes, or create your own account.");
  await env.DB!.prepare("DELETE FROM request_limits WHERE reset_at < ?").bind(stampMs - 86400_000).run();
  const auth = createAuth(request);
  const random = id();
  const signup = await auth.api.signUpEmail({
    body: { name: "NNT Studio", email: `demo-${random}@example.invalid`, password: `${id()}-${id()}` },
    headers: request.headers, returnHeaders: true,
  });
  const actor: Actor = signup.response.user;
  const workspace = await createWorkspace(db, actor, "NNT Creative Studio");
  const stamp = now();
  const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);
  const projects = [
    { id: id(), title: "Luna — Brand & digital experience", clientName: "Luna Coffee", clientEmail: "hello@luna.example", service: "Brand & website", description: "A warm, distinctive home for a specialty coffee brand. Scope: visual direction, responsive website, product story and handover guide.", budgetCents: 6800000, dueDate: day(14), status: "in_progress" },
    { id: id(), title: "Form — E-commerce redesign", clientName: "Form Objects", clientEmail: "studio@form.example", service: "E-commerce", description: "A considered shopping experience for everyday objects. Product discovery, collection pages, accessible product details and checkout design.", budgetCents: 9500000, dueDate: day(7), status: "review" },
    { id: id(), title: "Horizon — Analytics dashboard", clientName: "Horizon Labs", clientEmail: "team@horizon.example", service: "Web application", description: "Turn complex research activity into a calm dashboard. Brief, data views, account screens and a reusable interface system.", budgetCents: 12500000, dueDate: day(28), status: "discovery" },
    { id: id(), title: "Sora — Portfolio launch", clientName: "Sora Architecture", clientEmail: "hello@sora.example", service: "Portfolio website", description: "An editorial portfolio for an independent architecture studio, with project stories and a simple content handover.", budgetCents: 4200000, dueDate: day(-3), status: "completed" },
  ].map((project) => ({ ...project, workspaceId: workspace.id, currency: "THB", createdAt: stamp, updatedAt: stamp }));
  const taskRows = projects.flatMap((project, i) => ["Confirm brief & requirements", "Explore visual direction", "Build responsive screens", "Final review & handover"].map((title, n) => ({
    id: id(), projectId: project.id, title, dueDate: project.dueDate, createdAt: new Date(Date.now() + n).toISOString(),
    status: i === 3 || (i === 1 && n < 3) || (i === 0 && n < 2) ? "done" : i === 0 && n === 2 ? "in_progress" : "todo",
  })));
  const milestoneRows = projects.flatMap((project, i) => ["Creative direction", "Working prototype", "Final delivery"].map((title, n) => ({
    id: id(), projectId: project.id, title, dueDate: project.dueDate, createdAt: new Date(Date.now() + n).toISOString(),
    status: i === 3 ? "approved" : i === 1 && n < 2 ? "ready" : "pending",
  })));
  await db.batch([
    db.insert(s.projects).values(projects), db.insert(s.tasks).values(taskRows), db.insert(s.milestones).values(milestoneRows),
    db.insert(s.activities).values(projects.map((project) => event(project.id, actor, "Created this sample project"))),
    db.insert(s.comments).values({ id: id(), projectId: projects[0].id, authorId: actor.id, authorName: actor.name,
      body: "Welcome to your private demo workspace. These sample briefs are fictional. Try adding a task, uploading a file, or inviting a second account to review the work.", createdAt: stamp }),
  ]);
  return json(await bootstrap(db, actor), 201, signup.headers);
}

export async function handlePortal(request: Request) {
  const url = new URL(request.url); const path = url.pathname.replace(/\/$/, ""); const method = request.method;
  const db = getDb();
  if (method === "GET" && path === "/api/portal/bootstrap") return json(await bootstrap(db, await getActor(request)));
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) sameOrigin(request);
  if (method === "POST" && path === "/api/portal/demo") return demo(request, db);
  const actor = await requireActor(request);
  if (method === "POST" && path === "/api/portal/workspaces") return json(await createWorkspace(db, actor, (await readJson(request, v.workspaceInput)).name), 201);
  if (method === "POST" && path === "/api/portal/projects") return createProject(request, db, actor);
  if (method === "POST" && path === "/api/portal/invites/redeem") return redeemInvite(request, db, actor);
  const project = path.match(/^\/api\/portal\/projects\/([^/]+)$/);
  if (project && method === "GET") return json(await detail(db, project[1], actor));
  if (project && method === "PATCH") return patchProject(request, db, actor, project[1]);
  const action = path.match(/^\/api\/portal\/projects\/([^/]+)\/(invite|tasks|milestones|comments|files)$/);
  if (action && method === "POST") {
    if (action[2] === "invite") return makeInvite(db, actor, action[1]);
    if (action[2] === "tasks") return createTask(request, db, actor, action[1]);
    if (action[2] === "milestones") return createMilestone(request, db, actor, action[1]);
    if (action[2] === "comments") return createComment(request, db, actor, action[1]);
    return upload(request, db, actor, action[1]);
  }
  const task = path.match(/^\/api\/portal\/tasks\/([^/]+)$/);
  if (task && method === "PATCH") return patchTask(request, db, actor, task[1]);
  const milestone = path.match(/^\/api\/portal\/milestones\/([^/]+)$/);
  if (milestone && method === "PATCH") return patchMilestone(request, db, actor, milestone[1]);
  const file = path.match(/^\/api\/portal\/files\/([^/]+)$/);
  if (file && method === "GET") return download(db, actor, file[1]);
  if (file && method === "DELETE") return deleteFile(db, actor, file[1]);
  throw new HttpError(404, "Endpoint not found.");
}
