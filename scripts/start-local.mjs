import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import "./sites-env.mjs";

const built = resolve("dist/server");
if (!existsSync(`${built}/wrangler.json`)) throw new Error("Run npm run build first.");
const secret = readFileSync(".dev.vars", "utf8").match(/^BETTER_AUTH_SECRET=(.+)$/m)?.[1]?.trim();
if (!secret || secret.length < 32) throw new Error("Run npm run setup:local first.");
const config = JSON.parse(readFileSync(`${built}/wrangler.json`, "utf8"));
config.main = resolve(built, config.main);
config.assets.directory = resolve(built, config.assets.directory);
config.base_dir = built;
// Watch built modules only; watching the checkout would include D1/R2 writes
// and cause the preview to restart while a request is committing data.
config.build = { watch_dir: built };
config.vars = { ...config.vars, BETTER_AUTH_SECRET: secret };
mkdirSync(".sites-runtime", { recursive: true });
// A separate ignored configuration keeps secrets out of dist and deployment archives.
const local = resolve(".sites-runtime/wrangler-preview.json");
writeFileSync(local, JSON.stringify(config), { mode: 0o600 });
const child = spawn(process.execPath, ["./node_modules/wrangler/bin/wrangler.js", "dev", "--config", local,
  "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0", ...process.argv.slice(2)],
  { stdio: ["inherit", "pipe", "pipe"] });
for (const stream of [child.stdout, child.stderr]) {
  createInterface({ input: stream }).on("line", line => process.stdout.write(
    (line.includes("BETTER_AUTH_SECRET") ? "env.BETTER_AUTH_SECRET [redacted]" : line.split(secret).join("[redacted]")) + "\n"));
}
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", error => { rmSync(local, { force: true }); console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { rmSync(local, { force: true }); process.exitCode = code ?? 1; });
