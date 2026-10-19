import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

if (existsSync(".dev.vars")) {
  console.log("Keeping existing .dev.vars. Local authentication is configured.");
} else {
  writeFileSync(".dev.vars", `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\n`, { flag: "wx", mode: 0o600 });
  console.log("Created ignored .dev.vars with a random local authentication secret.");
}
console.log("Next: npm run build, npm run db:migrate, npm run dev.");
