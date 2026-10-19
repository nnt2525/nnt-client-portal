# Verification record

Recorded on 2026-10-19 (Asia/Bangkok). These results describe local verification of the portfolio MVP. They do not establish a successful CI run or a published application.

## Automated API checks

The integration suite in `tests/integration.test.mjs` was run against both the development server and the built Worker on localhost, with real local D1 and R2 storage. All 12 flow cases passed; Node's test report counted 13 passing tests including the parent test. The final built-Worker run completed in 6.6 seconds.

The checks exercised the application API, session cookies, stored records, and permission failures. Coverage includes:

- Owner registration, workspace/project creation, and project progress from stored tasks.
- Client invitations, membership, server-enforced owner/client permissions, and isolation between unrelated accounts.
- Racing redemption attempts for a one-use invitation.
- Task and milestone updates, feedback, and client approval of ready work.
- Private file upload/download, an upload at the 8 MiB file boundary, and rejected unsupported or oversized uploads.
- The atomic 20-file project quota, including concurrent uploads.
- Sign-out followed by sign-in and retrieval of saved work.

During verification, the project-progress query was corrected to correlate task counts with the current project. The runtime multipart body limit is configured to 9 MiB so that an allowed 8 MiB file plus multipart framing can reach the application's file validator. The application still enforces its own 8 MiB per-file, 20-file, and 40 MiB per-project limits.

## Installation and build checks

- `npm ci --dry-run` passed. This checks the lockfile/install plan; it is not a fresh dependency installation.
- Final TypeScript checks passed with `tsc --noEmit --incremental false`.
- The final responsive interface and API build passed through the Sites build helper.

## Browser walkthrough

The built application was checked at desktop width 1440 and mobile width 390. The mobile project page's document width matched its 390px viewport. Through the UI, a new project brief was created, a task was added, and its status changed to Done; progress updated to 100%. Dashboard and mobile screenshots are in `docs/images/`.

The final runtime also drains unused bounded request streams before returning responses. This fixes early authorization/error responses interrupting later requests in the Worker preview. The local production runner supplies the auth secret using an ignored local configuration, with secret values filtered from its log, rather than including secrets in the deployment artifact.

## Reproduce locally

Follow the README setup, migration, and development-server instructions, then run:

```sh
npm run test:integration
npm run typecheck
npm run build
```

The integration suite uses `http://127.0.0.1:5173` by default. Set `BASE_URL` if the local development server uses another origin. Use a disposable local database: the suite creates accounts, projects, invitations, and files.

## Remaining verification boundaries

Hosted migrations, external-client access, and hosted file downloads are separate from local verification. The hosted Site uses an owner-only access gate. GitHub Actions and deployment status are reported by their linked services; this local record does not claim a public deployment.
