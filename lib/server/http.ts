import { z } from "zod";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("Cache-Control", "private, no-store"); result.set("X-Content-Type-Options", "nosniff");
  return Response.json(value, { status, headers: result });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, "This action requires a same-origin request.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site requests are not allowed.");
}
export async function readJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Send application/json.");
  const raw = await readBounded(request, 24 * 1024);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400, "Invalid JSON body."); }
  return schema.parse(value);
}
export async function readBounded(request: Request, max: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function discardUnreadBody(request?: Request) {
  if (!request?.body || request.bodyUsed || request.body.locked) return;
  // Complete rejected request streams before returning an error. In workerd an
  // unread mutation body can otherwise interrupt the following HTTP request.
  const limit = 8 * 1024 * 1024 + 64 * 1024;
  const declared = request.headers.get("content-length");
  const reader = request.body.getReader();
  try {
    if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
      await reader.cancel(); return;
    }
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); return; }
    }
  } catch {
    // Preserve the original authorization or validation error on disconnect.
  } finally { reader.releaseLock(); }
}
export async function route(run: () => Promise<Response>, request?: Request) {
  try {
    const response = await run();
    // Auth libraries can return an early response without throwing (e.g. 429).
    await discardUnreadBody(request);
    return response;
  } catch (error) {
    await discardUnreadBody(request);
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues.map((item) => `${item.path.join(".") || "body"}: ${item.message}`).join("; ") }, 400);
    console.error("Portal request failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The request could not be completed. Please try again." }, 500);
  }
}
