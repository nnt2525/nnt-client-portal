import { route } from "@/lib/server/http";
import { handlePortal } from "@/lib/server/service";

export const GET = (request: Request) => route(() => handlePortal(request), request);
export const POST = GET;
export const PATCH = GET;
export const DELETE = GET;
