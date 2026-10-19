# Implementation contract

NNT Client Portal: a finished, bounded freelance studio MVP. React/TypeScript on Vinext (Next.js App Router API); Drizzle/D1; private R2 uploads; Better Auth email/password sessions. One owner per workspace, many client projects. Server checks project access for every read/write/download. No payment, email delivery, AI or fabricated integrations in this version.

## Shared data

Types are in `lib/contracts.ts`; all timestamps ISO strings, `dueDate` YYYY-MM-DD, budget integer satang (`budgetCents`, THB). API success JSON is the described value directly; errors `{error: string}` with appropriate non-2xx status. Any change to this contract needs communication between agents.

## API

- Better Auth at `/api/auth/[...all]`: email signup/signin/signout/get-session. `/api/auth/ok` health.
- `GET /api/portal/bootstrap` => Bootstrap (anonymous returns user:null/empty arrays).
- `POST /api/portal/workspaces` `{name}` => Workspace (current user owner).
- `POST /api/portal/demo` no body => Bootstrap plus authenticated cookie. Isolated generated demo account/workspace with realistic sample projects. Never shared passwords or cross-user records.
- `POST /api/portal/projects` NewProject => Project. Owner only. Creates initial milestones from service scope if useful.
- `GET /api/portal/projects/:id` => ProjectDetail.
- `PATCH /api/portal/projects/:id` `{status?,title?,description?,dueDate?}` => Project. Owner only.
- `POST /api/portal/projects/:id/invite` => `{token,expiresAt}`. Owner creates a one-use 7-day invite; store hash only. No email sent. UI shows copyable join URL `/?invite=TOKEN`. Any signed-in user redeeming secret receives membership, so email is display only, not identity proof.
- `POST /api/portal/invites/redeem` `{token}` => `{projectId}`; atomically consumes token, grants that project to current client; cannot grant workspace ownership.
- `POST /api/portal/projects/:id/tasks` `{title,dueDate?}` => Task. Owner only.
- `PATCH /api/portal/tasks/:id` `{status}` => Task. Owner only.
- `POST /api/portal/projects/:id/milestones` `{title,dueDate?}` => Milestone. Owner only.
- `PATCH /api/portal/milestones/:id` `{status}` => Milestone. Owner can set pending/ready, client can approve only ready. Approval is recorded in activity.
- `POST /api/portal/projects/:id/comments` `{body}` => Comment. Both project members.
- `POST /api/portal/projects/:id/files` multipart field `file` => ProjectFile. Both members, max 8 MiB, private bucket; reject unsupported executable/HTML/SVG types. At least PDF/PNG/JPEG/WebP/TXT supported. Validate actual bytes for binary formats. Enforce per-project count/total bytes caps.
- `GET /api/portal/files/:id` => authorized attachment download. Never expose R2 keys, use safe content disposition/nosniff, private no-store.
- `DELETE /api/portal/files/:id` => `{ok:true}`. Workspace owner only.

All mutations enforce same-origin. Session comes from Better Auth server check, never client-supplied IDs/roles. Unauthenticated mutation 401, inaccessible record 404, insufficient permission 403. Zod bounds and semantic/date validation. Parameterized queries; no schema creation in request paths; durable schema-only migrations. Demo seed is request-time explicit workflow, not migration seed.

## UX

English primary with Thai helper text where useful; charcoal/ivory/lime/lavender NNT studio branding. Responsive app: Overview, Projects, project detail tabs (Overview/Tasks/Files/Feedback), new project brief dialog, auth/onboarding/join screen. Real data loading/empty/error states, keyboard accessible dialog/forms, labels, clear upload constraints, copy invite fallback. Charts derive from records. Dashboard shows project counts/progress, activity and deadlines. Functional clients see only their joined projects and can comment/upload/approve. Include user menu/signout. Build a coherent polished product, not another style gallery.

## Ownership

Backend agent owns db/schema.ts, lib/server/**, app/api/**, generated migrations and backend tests. Frontend agent owns components/portal/** and app/globals.css. Root owns app/page.tsx, layout, config, integration, preview, CI/GitHub/publishing. Contracts changes coordinate first. Documentation agent owns README.md and docs/** after API implementation stabilizes.
