import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";
import type { AuthRequest } from "./types.js";

export function audit(
  db: SqliteDatabase,
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId?: string,
  metadata: Record<string, unknown> = {},
): void {
  db.prepare(`INSERT INTO audit_logs (id, council_id, user_id, action, entity_type, entity_id, metadata, ip_address)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), req.user?.councilId ?? null, req.user?.id ?? null, action, entityType, entityId ?? null, JSON.stringify(metadata), req.ip || "");
}
