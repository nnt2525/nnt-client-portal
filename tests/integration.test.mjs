import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const origin = new URL(BASE_URL).origin;
let browserId = 0;
const testNetwork = randomUUID().slice(0, 4);
function browser() {
  const cookies = new Map();
  const testIp = `2001:db8:${testNetwork}:${++browserId}::1`;
  return {
    credentials: null,
    async request(path, { method = "GET", body, headers = {} } = {}) {
      const requestHeaders = new Headers(headers);
      requestHeaders.set("cf-connecting-ip", testIp);
      if (cookies.size) requestHeaders.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
      if (method !== "GET") requestHeaders.set("Origin", origin);
      if (body && !(body instanceof FormData)) { requestHeaders.set("Content-Type", "application/json"); body = JSON.stringify(body); }
      const response = await fetch(`${BASE_URL}${path}`, { method, headers: requestHeaders, body });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0]; const divider = pair.indexOf("=");
        if (divider >= 0) cookies.set(pair.slice(0, divider), pair.slice(divider + 1));
      }
      return response;
    },
  };
}
async function value(response, expected = 200) {
  const text = await response.text();
  assert.equal(response.status, expected, text);
  return text ? JSON.parse(text) : null;
}
async function signup(client, label) {
  const email = `${label}-${randomUUID()}@example.com`;
  const password = `Test-${randomUUID()}`;
  const response = await value(await client.request("/api/auth/sign-up/email", { method: "POST", body: {
    email, password, name: label, role: "owner", workspaceId: "forged-workspace",
  } }));
  assert.ok(response.user.id);
  client.credentials = { email, password };
  return response.user;
}
const createInput = (workspaceId, overrides = {}) => ({ workspaceId, title: "Integration project", clientName: "Client A", clientEmail: "client@example.com",
  service: "Brand & website", description: "A real persisted integration brief.", budgetCents: 2500000, dueDate: "2027-05-21", ...overrides });
const upload = (client, projectId, name = "notes.txt", data = "hello", type = "text/plain") => {
  const form = new FormData(); form.set("file", new File([data], name, { type }));
  return client.request(`/api/portal/projects/${projectId}/files`, { method: "POST", body: form });
};

test("authenticated full-stack workflows, isolation and server-side permissions", async (t) => {
  const owner = browser(); const outsider = browser(); const client = browser(); const rival = browser();
  let ownerUser, clientUser, workspace, project, outsiderProject, task, milestone, file;

  await t.test("anonymous bootstrap is empty and protected data needs a session", async () => {
    assert.deepEqual(await value(await owner.request("/api/portal/bootstrap")), { user: null, workspaces: [], projects: [] });
    await value(await owner.request("/api/portal/workspaces", { method: "POST", body: { name: "forged" } }), 401);
    const crossOrigin = await fetch(`${BASE_URL}/api/portal/demo`, { method: "POST", headers: { Origin: "https://attacker.example" } });
    assert.equal(crossOrigin.status, 403, "Either the framework or the API must reject cross-origin mutations");
    const missingOrigin = await fetch(`${BASE_URL}/api/portal/demo`, { method: "POST" });
    await value(missingOrigin, 403);
  });
  await t.test("signup never grants access to another account's workspace", async () => {
    ownerUser = await signup(owner, "Owner");
    clientUser = await signup(client, "Client");
    await signup(outsider, "Outsider"); await signup(rival, "Rival");
    assert.equal((await value(await owner.request("/api/portal/bootstrap"))).user.id, ownerUser.id);
    workspace = await value(await owner.request("/api/portal/workspaces", { method: "POST", body: { name: "Integration studio" } }), 201);
    assert.equal(workspace.role, "owner");
    project = await value(await owner.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id, { clientEmail: clientUser.email }) }), 201);
    assert.equal(project.budgetCents, 2500000);
    assert.equal(project.progress, 0);
    const clientBoot = await value(await client.request("/api/portal/bootstrap"));
    assert.equal(clientBoot.projects.length, 0, "A matching client email is not proof of identity or a membership grant");
    await value(await client.request(`/api/portal/projects/${project.id}`), 404);
    await value(await outsider.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id) }), 404);
    const otherWorkspace = await value(await outsider.request("/api/portal/workspaces", { method: "POST", body: { name: "Other studio" } }), 201);
    outsiderProject = await value(await outsider.request("/api/portal/projects", { method: "POST", body: createInput(otherWorkspace.id) }), 201);
    await value(await owner.request(`/api/portal/projects/${outsiderProject.id}`), 404);
    await value(await outsider.request(`/api/portal/projects/${project.id}`, { method: "PATCH", body: { status: "completed" } }), 404);
  });
  await t.test("bounded typed validation rejects forged roles, money and impossible dates", async () => {
    await value(await owner.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id, { budgetCents: -1 }) }), 400);
    await value(await owner.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id, { budgetCents: 3.14 }) }), 400);
    await value(await owner.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id, { dueDate: "2027-02-30" }) }), 400);
    await value(await owner.request(`/api/portal/projects/${project.id}`, { method: "PATCH", body: { ownerId: clientUser.id } }), 400);
    const updated = await value(await owner.request(`/api/portal/projects/${project.id}`, { method: "PATCH", body: { status: "in_progress", title: "Updated integration project" } }));
    assert.equal(updated.status, "in_progress");
    assert.equal(updated.title, "Updated integration project");
  });
  await t.test("one-use invitation gives exactly one client project access", async () => {
    const invite = await value(await owner.request(`/api/portal/projects/${project.id}/invite`, { method: "POST" }), 201);
    assert.match(invite.token, /^[a-f0-9]{64}$/);
    const redeemed = await value(await client.request("/api/portal/invites/redeem", { method: "POST", body: { token: invite.token } }));
    assert.equal(redeemed.projectId, project.id);
    await value(await rival.request("/api/portal/invites/redeem", { method: "POST", body: { token: invite.token } }), 409);
    const boot = await value(await client.request("/api/portal/bootstrap"));
    assert.equal(boot.projects.length, 1); assert.equal(boot.workspaces[0].role, "client");
    assert.equal((await value(await client.request(`/api/portal/projects/${project.id}`))).role, "client");
    await value(await rival.request(`/api/portal/projects/${project.id}`), 404);
    await value(await client.request(`/api/portal/projects/${outsiderProject.id}`), 404);
    await value(await client.request(`/api/portal/projects/${project.id}/invite`, { method: "POST" }), 403);
    await value(await client.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id) }), 404);
  });
  await t.test("concurrent invitation redemption cannot grant the same secret twice", async () => {
    const invite = await value(await owner.request(`/api/portal/projects/${outsiderProject.id}/invite`, { method: "POST" }), 404);
    assert.ok(invite.error);
    const real = await value(await outsider.request(`/api/portal/projects/${outsiderProject.id}/invite`, { method: "POST" }), 201);
    const outcomes = await Promise.all([
      owner.request("/api/portal/invites/redeem", { method: "POST", body: { token: real.token } }),
      rival.request("/api/portal/invites/redeem", { method: "POST", body: { token: real.token } }),
    ]);
    assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 409]);
    const views = await Promise.all([owner.request(`/api/portal/projects/${outsiderProject.id}`), rival.request(`/api/portal/projects/${outsiderProject.id}`)]);
    assert.deepEqual(views.map((response) => response.status).sort(), [200, 404]);
  });
  await t.test("owner tasks persist, progress derives from records and clients cannot edit", async () => {
    task = await value(await owner.request(`/api/portal/projects/${project.id}/tasks`, { method: "POST", body: { title: "Build accessible navigation", dueDate: "2027-05-20" } }), 201);
    await value(await client.request(`/api/portal/projects/${project.id}/tasks`, { method: "POST", body: { title: "forged" } }), 403);
    await value(await client.request(`/api/portal/tasks/${task.id}`, { method: "PATCH", body: { status: "done" } }), 403);
    await value(await outsider.request(`/api/portal/tasks/${task.id}`, { method: "PATCH", body: { status: "done" } }), 404);
    await value(await owner.request(`/api/portal/tasks/${task.id}`, { method: "PATCH", body: { status: "done" } }));
    const detail = await value(await owner.request(`/api/portal/projects/${project.id}`));
    assert.equal(detail.tasks[0].status, "done"); assert.equal(detail.project.progress, 100); assert.equal(detail.project.completedTasks, 1);
  });
  await t.test("milestones require explicit client approval of ready work", async () => {
    milestone = await value(await owner.request(`/api/portal/projects/${project.id}/milestones`, { method: "POST", body: { title: "Prototype approval" } }), 201);
    await value(await client.request(`/api/portal/milestones/${milestone.id}`, { method: "PATCH", body: { status: "approved" } }), 409);
    await value(await owner.request(`/api/portal/milestones/${milestone.id}`, { method: "PATCH", body: { status: "approved" } }), 403);
    await value(await owner.request(`/api/portal/milestones/${milestone.id}`, { method: "PATCH", body: { status: "ready" } }));
    await value(await client.request(`/api/portal/milestones/${milestone.id}`, { method: "PATCH", body: { status: "pending" } }), 403);
    const approved = await value(await client.request(`/api/portal/milestones/${milestone.id}`, { method: "PATCH", body: { status: "approved" } }));
    assert.equal(approved.status, "approved");
    await value(await owner.request(`/api/portal/milestones/${milestone.id}`, { method: "PATCH", body: { status: "pending" } }), 409);
    const detail = await value(await owner.request(`/api/portal/projects/${project.id}`));
    assert.ok(detail.activity.some((activity) => activity.actorName === "Client" && activity.action.startsWith("Approved milestone")));
  });
  await t.test("feedback uses the authenticated author and persists as plain text", async () => {
    const body = "Looks good! <script>alert('plain text')</script> ภาษาไทย";
    const comment = await value(await client.request(`/api/portal/projects/${project.id}/comments`, { method: "POST", body: { body } }), 201);
    assert.equal(comment.authorId, clientUser.id); assert.equal(comment.body, body);
    await value(await client.request(`/api/portal/projects/${project.id}/comments`, { method: "POST", body: { body: "forged", authorId: ownerUser.id } }), 400);
    await value(await outsider.request(`/api/portal/projects/${project.id}/comments`, { method: "POST", body: { body: "unauthorized" } }), 404);
    assert.equal((await value(await owner.request(`/api/portal/projects/${project.id}`))).comments[0].body, body);
  });
  await t.test("private file upload validates bytes, hides keys and authorizes every download", async () => {
    await value(await upload(client, project.id, "payload.svg", "<svg></svg>", "image/svg+xml"), 415);
    await value(await upload(client, project.id, "fake.png", "<script>alert(1)</script>", "image/png"), 415);
    await value(await upload(client, project.id, "empty.txt", ""), 413);
    assert.equal((await upload(client, project.id, "huge.txt", new Uint8Array(8 * 1024 * 1024 + 1))).status, 413);
    const boundaryFile = await value(await upload(client, project.id, "boundary.txt", "x".repeat(8 * 1024 * 1024)), 201);
    assert.equal(boundaryFile.size, 8 * 1024 * 1024);
    await value(await owner.request(`/api/portal/files/${boundaryFile.id}`, { method: "DELETE" }));
    file = await value(await upload(client, project.id, "brief ภาษาไทย.txt", "Private attachment ภาษาไทย"), 201);
    assert.equal(file.uploaderName, "Client"); assert.equal(file.objectKey, undefined); assert.equal(file.uploaderId, undefined);
    const response = await owner.request(`/api/portal/files/${file.id}`);
    assert.equal(response.status, 200); assert.equal(await response.text(), "Private attachment ภาษาไทย");
    assert.match(response.headers.get("content-disposition"), /^attachment;/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    await value(await outsider.request(`/api/portal/files/${file.id}`), 404);
    await value(await browser().request(`/api/portal/files/${file.id}`), 401);
    await value(await client.request(`/api/portal/files/${file.id}`, { method: "DELETE" }), 403);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=", "base64");
    const image = await value(await upload(owner, project.id, "pixel.png", png, "image/png"), 201);
    assert.equal(image.contentType, "image/png");
    await value(await owner.request(`/api/portal/files/${image.id}`, { method: "DELETE" }));
    await value(await owner.request(`/api/portal/files/${file.id}`, { method: "DELETE" }));
    await value(await owner.request(`/api/portal/files/${file.id}`), 404);
  });
  await t.test("concurrent uploads reserve the project file quota atomically", async () => {
    const storageProject = await value(await owner.request("/api/portal/projects", { method: "POST", body: createInput(workspace.id, { title: "Quota integration" }) }), 201);
    for (let index = 0; index < 18; index++) await value(await upload(owner, storageProject.id, `file-${index}.txt`, `File ${index}`), 201);
    const responses = await Promise.all([0, 1, 2, 3].map((index) => upload(owner, storageProject.id, `parallel-${index}.txt`, "Quota test")));
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 201, 409, 409]);
    const detail = await value(await owner.request(`/api/portal/projects/${storageProject.id}`));
    assert.equal(detail.files.length, 20);
    // Clean up uploaded objects so the integration run does not consume bucket quota.
    for (const entry of detail.files) await value(await owner.request(`/api/portal/files/${entry.id}`, { method: "DELETE" }));
  });
  await t.test("signout invalidates the session and signin restores persisted work", async () => {
    await value(await owner.request("/api/auth/sign-out", { method: "POST", body: {} }));
    assert.equal((await value(await owner.request("/api/portal/bootstrap"))).user, null);
    await value(await owner.request(`/api/portal/projects/${project.id}`), 401);
    await value(await owner.request("/api/auth/sign-in/email", { method: "POST", body: { ...owner.credentials, password: "Definitely-wrong-password" } }), 401);
    await value(await owner.request("/api/auth/sign-in/email", { method: "POST", body: owner.credentials }));
    const restored = await value(await owner.request(`/api/portal/projects/${project.id}`));
    assert.equal(restored.project.title, "Updated integration project");
    assert.equal(restored.tasks[0].status, "done");
  });
  await t.test("demo accounts are isolated sessions with fictional but durable records", async () => {
    const first = browser(); const second = browser();
    const a = await value(await first.request("/api/portal/demo", { method: "POST" }), 201);
    const b = await value(await second.request("/api/portal/demo", { method: "POST" }), 201);
    assert.notEqual(a.user.id, b.user.id); assert.notEqual(a.workspaces[0].id, b.workspaces[0].id);
    assert.equal(a.projects.length, 4); assert.equal(b.projects.length, 4);
    assert.equal((await value(await first.request("/api/portal/bootstrap"))).user.id, a.user.id);
    await value(await second.request(`/api/portal/projects/${a.projects[0].id}`), 404);
    await value(await first.request("/api/auth/sign-out", { method: "POST", body: {} }));
    assert.equal((await value(await first.request("/api/portal/bootstrap"))).user, null);
  });
});
