declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
