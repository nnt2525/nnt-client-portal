# Portal API

The API is same-origin. Normal browser requests use the Better Auth session cookie; clients must not send a user ID or role as authorization. All portal mutations enforce same-origin checks.

Successful responses are the value described below, without a generic `data` wrapper. Errors have the shape `{ "error": "message" }`.

| Status | Meaning |
| --- | --- |
| `400` | Invalid input |
| `401` | Authentication required |
| `403` | Authenticated but action not permitted, or rejected origin |
| `404` | Record missing or inaccessible to the requester |
| `409` | Used/expired invitation, invalid state transition, or record/storage limit |
| `413` | Request or file too large |
| `415` | Unsupported content type or file format |

Other status codes may represent throttling or server errors. Frontends should show the returned message and handle non-success responses.

## Authentication

Better Auth handles email/password authentication under `/api/auth/[...all]`, including signup, signin, signout, and session retrieval. `/api/auth/ok` is the authentication health endpoint. Use the application's auth client or the API supported by the installed Better Auth version.

Email verification and password-reset email delivery are not configured in this MVP.

## Bootstrap and workspaces

| Method and path | Request | Response | Access |
| --- | --- | --- | --- |
| `GET /api/portal/bootstrap` | None | `{ user, workspaces, projects }` | Anonymous returns `user: null` and empty arrays; signed-in responses contain accessible records |
| `POST /api/portal/workspaces` | `{ name }` | `Workspace` | Signed in; current user becomes owner |
| `POST /api/portal/demo` | No body | `Bootstrap` plus a session cookie | Creates an isolated disposable demo account/workspace |

Demo records belong to the generated account; they are not a shared global workspace. The demo endpoint is an explicit sample-data action, not database migration seeding.

An account may own up to 10 workspaces, with up to 100 projects per workspace.

## Projects

| Method and path | Request | Response | Access |
| --- | --- | --- | --- |
| `POST /api/portal/projects` | `NewProject` | `Project` | Owner of the supplied workspace |
| `GET /api/portal/projects/:id` | None | `ProjectDetail` | Workspace owner or project client |
| `PATCH /api/portal/projects/:id` | `{ status?, title?, description?, dueDate? }` | `Project` | Workspace owner |
| `POST /api/portal/projects/:id/invite` | No body | `{ token, expiresAt }` | Workspace owner |
| `POST /api/portal/invites/redeem` | `{ token }` | `{ projectId }` | Signed in; valid unconsumed invitation |

`NewProject`:

```json
{
  "workspaceId": "workspace-id",
  "title": "Bakery website",
  "clientName": "Example Bakery",
  "clientEmail": "client@example.com",
  "service": "Website design",
  "description": "A responsive catalogue and contact page.",
  "budgetCents": 3500000,
  "dueDate": "2027-02-28"
}
```

The example budget is ฿35,000.00. Values are stored as integer satang. The server creates three initial milestones: Brief & direction, Design & development, and Review & handover.

Project statuses are `discovery`, `in_progress`, `review`, and `completed`. A returned project also contains calculated `progress`, `taskCount`, and `completedTasks`.

An invite expires after seven days and is usable once. The response contains the only copy of the raw token; the database stores its hash. A join link uses `/?invite=TOKEN`. Any signed-in holder of the secret link can redeem it, regardless of the contact email in the brief. Redemption grants one project's client membership, never workspace ownership.

## Tasks, milestones, and feedback

| Method and path | Request | Response | Access |
| --- | --- | --- | --- |
| `POST /api/portal/projects/:id/tasks` | `{ title, dueDate? }` | `Task` | Workspace owner |
| `PATCH /api/portal/tasks/:id` | `{ status }` | `Task` | Workspace owner |
| `POST /api/portal/projects/:id/milestones` | `{ title, dueDate? }` | `Milestone` | Workspace owner |
| `PATCH /api/portal/milestones/:id` | `{ status }` | `Milestone` | Owner sets `pending`/`ready`; client approves only `ready` |
| `POST /api/portal/projects/:id/comments` | `{ body }` | `Comment` | Workspace owner or project client |

Task statuses: `todo`, `in_progress`, `done`. Milestone statuses: `pending`, `ready`, `approved`. A client approval also creates an activity record.

Feedback is plain text. It is rendered as text, not executable HTML.

## Files

| Method and path | Request | Response | Access |
| --- | --- | --- | --- |
| `POST /api/portal/projects/:id/files` | Multipart form, one field named `file` | `ProjectFile` | Workspace owner or project client |
| `GET /api/portal/files/:id` | None | Authorized attachment download | Workspace owner or project client |
| `DELETE /api/portal/files/:id` | None | `{ ok: true }` | Workspace owner |

The per-file limit is 8 MiB, with at most 20 files and 40 MiB total per project. PDF, PNG, JPEG, WebP, and UTF-8 plain text are supported; executable files, HTML, SVG, invalid binary signatures, and over-limit uploads are rejected. Storage quota reservations include in-flight uploads.

`ProjectFile` contains `id`, `projectId`, `name`, `size`, `contentType`, `uploaderName`, and `createdAt`. It never contains the private R2 key. Downloads use attachment disposition, `nosniff`, and private no-store responses.

## Response contracts

See `lib/contracts.ts` for the complete TypeScript interfaces:

- `PortalUser`: public session identity (`id`, `name`, `email`).
- `Workspace`: `id`, `name`, and the current user's `role`.
- `Project`: brief, budget, deadline, status, timestamps, calculated task progress.
- `ProjectDetail`: `project`, current user's `role`, `tasks`, `milestones`, `comments`, `files`, and `activity`.
- `Task`, `Milestone`, `Comment`, `ProjectFile`, `Activity`: project-scoped records.

All timestamps are ISO strings. Date-only deadlines use `YYYY-MM-DD`.
