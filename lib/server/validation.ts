import { z } from "zod";

const label = z.string().trim().min(1).max(160);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}, "Choose a valid date between 2000 and 2100.");
export const workspaceInput = z.object({ name: label.max(80) }).strict();
export const projectInput = z.object({
  workspaceId: z.string().uuid(), title: label, clientName: label.max(100), clientEmail: z.string().trim().toLowerCase().email().max(254),
  service: label.max(80), description: z.string().trim().max(6000), budgetCents: z.number().int().min(0).max(1_000_000_000), dueDate: date,
}).strict();
export const projectPatch = z.object({
  status: z.enum(["discovery", "in_progress", "review", "completed"]).optional(), title: label.optional(), description: z.string().trim().max(6000).optional(), dueDate: date.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "Include a field to update.");
export const itemInput = z.object({ title: label, dueDate: date.optional() }).strict();
export const taskPatch = z.object({ status: z.enum(["todo", "in_progress", "done"]) }).strict();
export const milestonePatch = z.object({ status: z.enum(["pending", "ready", "approved"]) }).strict();
export const commentInput = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
export const tokenInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid invitation.") }).strict();
