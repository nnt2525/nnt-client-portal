import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const config = "dist/server/wrangler.json";
if (!existsSync(config)) throw new Error("Run npm run build before applying local migrations.");
mkdirSync(".sites-runtime", { recursive: true });
const journalPath = ".sites-runtime/local-migrations.json";
const stateRoot = ".wrangler/state";
// A removed local DB starts a fresh migration history. Keep state scoped to this checkout.
const journal = existsSync(journalPath) && existsSync(`${stateRoot}/v3/d1`)
  ? JSON.parse(readFileSync(journalPath, "utf8")) : {};
for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
  const hash = createHash("sha256").update(readFileSync(`drizzle/${file}`)).digest("hex");
  if (journal[file]) {
    if (journal[file] !== hash) throw new Error(`Previously applied migration changed: ${file}`);
    continue;
  }
  const result = spawnSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", config, "--persist-to", stateRoot, "--file", resolve("drizzle", file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  journal[file] = hash;
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
}
console.log("Local D1 migrations are up to date. No hosted database was changed.");
