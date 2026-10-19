export type ProjectStatus = "discovery" | "in_progress" | "review" | "completed";
export type TaskStatus = "todo" | "in_progress" | "done";
export type MilestoneStatus = "pending" | "ready" | "approved";
export type Role = "owner" | "client";
export interface PortalUser { id: string; name: string; email: string }
export interface Workspace { id: string; name: string; role: Role }
export interface Project {
  id: string; workspaceId: string; title: string; clientName: string; clientEmail: string;
  service: string; description: string; budgetCents: number; currency: string;
  dueDate: string; status: ProjectStatus; createdAt: string; updatedAt: string;
  progress: number; taskCount: number; completedTasks: number;
}
export interface Task { id: string; projectId: string; title: string; status: TaskStatus; dueDate: string; createdAt: string }
export interface Milestone { id: string; projectId: string; title: string; dueDate: string; status: MilestoneStatus; createdAt: string }
export interface Comment { id: string; projectId: string; authorName: string; authorId: string; body: string; createdAt: string }
export interface ProjectFile { id: string; projectId: string; name: string; size: number; contentType: string; uploaderName: string; createdAt: string }
export interface Activity { id: string; projectId: string; actorName: string; action: string; createdAt: string }
export interface Bootstrap { user: PortalUser | null; workspaces: Workspace[]; projects: Project[] }
export interface ProjectDetail { project: Project; role: Role; tasks: Task[]; milestones: Milestone[]; comments: Comment[]; files: ProjectFile[]; activity: Activity[] }
export interface NewProject { workspaceId: string; title: string; clientName: string; clientEmail: string; service: string; description: string; budgetCents: number; dueDate: string }
