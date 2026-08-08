import type { Request } from "express";

export const roles = ["admin", "vorsitz", "sekretariat", "mitglied", "ersatzmitglied", "lesezugriff"] as const;
export type Role = (typeof roles)[number];

export type Permission =
  | "council:manage"
  | "members:manage"
  | "meetings:write"
  | "cases:write"
  | "documents:write"
  | "tasks:write"
  | "inquiries:write"
  | "agreements:write"
  | "trainings:write"
  | "links:write"
  | "audit:read";

const allPermissions: Permission[] = [
  "council:manage", "members:manage", "meetings:write", "cases:write",
  "documents:write", "tasks:write", "inquiries:write", "agreements:write",
  "trainings:write", "links:write", "audit:read",
];

export const rolePermissions: Record<Role, Permission[]> = {
  admin: allPermissions,
  vorsitz: allPermissions,
  sekretariat: ["members:manage", "meetings:write", "cases:write", "documents:write", "tasks:write", "inquiries:write", "agreements:write", "trainings:write", "links:write"],
  mitglied: ["meetings:write", "cases:write", "documents:write", "tasks:write", "inquiries:write", "agreements:write", "trainings:write", "links:write"],
  ersatzmitglied: ["tasks:write", "inquiries:write"],
  lesezugriff: [],
};

export interface AuthUser {
  id: string;
  councilId: string;
  councilName: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
  csrfToken?: string;
}
