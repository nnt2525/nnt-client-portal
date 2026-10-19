# Running and hosting the portal

Application hosting and source-code hosting are separate. The repository contains the source; a running instance also needs a Worker-compatible runtime, a D1 database, a private R2 bucket, an authentication secret, and applied SQL migrations.

## Local development

The README quickstart builds the application before applying local migrations. The setup helper generates `.dev.vars` with `BETTER_AUTH_SECRET`; it keeps an existing file unchanged. Local D1/R2 state persists under `.wrangler/state/` and is shared by the development server and built Worker preview.

Use loopback for local development. If you choose a different port, open the printed URL and use that same origin for all API calls. Cookies belong to the browser profile; separate profiles are useful for owner/client testing.

Never commit `.dev.vars`, `.wrangler/`, `.sites-runtime/`, real client files, or copied session cookies. Deleting local state deletes local development records; it does not reset a hosted database.

## Hosting access policy

The current Sites hosting configuration is private to the site owner. Platform access happens before the portal's own email/password authentication. An application invitation does not bypass that hosting restriction: an external client needs permission to open the hosted site as well as membership in the project.

For a recruiter or external client walkthrough, run a local demonstration, provide screenshots/video from fictional data, or deliberately configure a suitable shared/public hosting policy later. A public GitHub repository alone does not make the running application publicly accessible.

## Required server configuration

| Configuration | Purpose |
| --- | --- |
| `DB` | D1 database binding used by Drizzle and Better Auth |
| `BUCKET` | Private R2 bucket binding for project attachments |
| `BETTER_AUTH_SECRET` | At least 32 random characters, configured as a server secret |
| SQL migrations | Versioned schema in `drizzle/`, applied to the correct environment |

The repository's `.openai/hosting.json` declares the binding names. Local configuration and local migration commands target development state. A hosted deployment must provision its own resources and apply production migrations through its deployment workflow.

The portal derives its auth origin from the server request. File downloads go through the application route; a public R2 bucket URL is unnecessary.

## Before using real client data

This is a portfolio MVP. Email verification, account-recovery email, payments, invitation email delivery, and AI integrations are not configured. If you operate a real instance, define account recovery, retention, backups, logging, and access policy for that environment first.

Back up D1 records and R2 objects together. The database contains file metadata and membership; the bucket contains attachment bytes. Restoring one without the other can leave missing attachments or orphaned objects.

Use a separate instance and fictional data for public demonstrations. Demo accounts are disposable and have no shared recovery credential.
