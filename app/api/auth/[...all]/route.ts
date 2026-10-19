import { createAuth } from "@/lib/server/auth";
import { route, sameOrigin } from "@/lib/server/http";

export const GET = (request: Request) => route(() => createAuth(request).handler(request), request);
export const POST = (request: Request) => route(async () => {
  sameOrigin(request);
  return createAuth(request).handler(request);
}, request);
