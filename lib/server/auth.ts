import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

export function createAuth(request: Request) {
  const secret = (env as Cloudflare.Env & { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 random characters.");
  const origin = new URL(request.url).origin;
  return betterAuth({
    appName: "NNT Client Portal", baseURL: origin, secret,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema, transaction: false }),
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, requireEmailVerification: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    trustedOrigins: [origin],
    advanced: { useSecureCookies: new URL(request.url).protocol === "https:", cookiePrefix: "nnt-portal", ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
  });
}
