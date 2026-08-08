import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { permit } from "../auth.js";
import { getDb, type SqliteDatabase } from "../database.js";
import { HttpError } from "../http.js";
import { betrvg, findProvision, getProcedureTemplate, procedureTemplates, provisionSummary, searchProvisions, suggestLegalSections } from "../legal.js";
import { notify } from "../notifications.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const entityType = z.enum(["case", "task", "inquiry", "agreement", "decision", "document", "meeting", "training", "member", "committee"]);
type EntityType = z.infer<typeof entityType>;

const definitions: Record<EntityType, { table: string; context: string }> = {
  case: { table: "cases", context: "reference || ' ' || title || ' ' || category || ' ' || legal_basis || ' ' || description" },
  task: { table: "tasks", context: "title || ' ' || description" },
  inquiry: { table: "inquiries", context: "reference || ' ' || subject || ' ' || category || ' ' || description || ' ' || outcome" },
  agreement: { table: "agreements", context: "reference || ' ' || title || ' ' || category || ' ' || summary" },
  decision: { table: "decisions", context: "reference || ' ' || title || ' ' || resolution_text" },
  document: { table: "documents", context: "title || ' ' || folder || ' ' || category" },
  meeting: { table: "meetings", context: "title || ' ' || kind || ' ' || minutes" },
  training: { table: "trainings", context: "title || ' ' || provider || ' ' || notes" },
  member: { table: "users", context: "first_name || ' ' || last_name || ' ' || role || ' ' || position" },
  committee: { table: "committees", context: "name || ' ' || kind || ' ' || description" },
};

function readContext(db: SqliteDatabase, councilId: string, type: EntityType, id: string): string | undefined {
  const definition = definitions[type];
  const row = db.prepare(`SELECT ${definition.context} context FROM ${definition.table} WHERE id=? AND council_id=?`).get(id, councilId) as { context: string } | undefined;
  return row?.context;
}

function provisionDto(id: string) {
  const provision = findProvision(id);
  return provision ? { ...provision, plainSummary: provisionSummary(provision) } : undefined;
}

router.get("/legal/meta", (_req, res) => {
  res.json({
    law: betrvg.law,
    abbreviation: betrvg.abbreviation,
    source: betrvg.source,
    sourceUrl: betrvg.sourceUrl,
    versionNote: betrvg.versionNote,
    buildDate: betrvg.buildDate,
    retrievedAt: betrvg.retrievedAt,
    count: betrvg.provisions.length,
    chapters: [...new Set(betrvg.provisions.map(provision => provision.chapter))],
    disclaimer: "Rechtliche Orientierung und Arbeitshilfe – keine Rechtsberatung. Fristen und Einzelfälle fachkundig prüfen.",
  });
});

router.get("/legal/provisions", (req, res) => {
  const query = String(req.query.q ?? "").slice(0, 200);
  const chapter = String(req.query.chapter ?? "").slice(0, 500);
  const items = searchProvisions(query, chapter).map(provision => ({ ...provision, text: undefined, plainSummary: provisionSummary(provision) }));
  res.json({ items });
});

router.get("/legal/provisions/:id", (req, res) => {
  const provision = provisionDto(String(req.params.id));
  if (!provision) throw new HttpError(404, "BetrVG-Vorschrift nicht gefunden.");
  res.json({ item: provision });
});

router.get("/legal/links/:type/:id", (req: AuthRequest, res) => {
  const type = entityType.parse(String(req.params.type));
  const id = String(req.params.id);
  const db = getDb();
  if (readContext(db, req.user!.councilId, type, id) === undefined) throw new HttpError(404, "Datensatz nicht gefunden.");
  const links = db.prepare("SELECT id,provision_id,created_at FROM entity_legal_links WHERE council_id=? AND entity_type=? AND entity_id=? ORDER BY provision_id").all(req.user!.councilId, type, id) as Array<{ id: string; provision_id: string; created_at: string }>;
  res.json({ items: links.flatMap(link => { const provision = provisionDto(link.provision_id); return provision ? [{ linkId: link.id, linkedAt: link.created_at, ...provision }] : []; }) });
});

router.get("/legal/suggestions/:type/:id", (req: AuthRequest, res) => {
  const type = entityType.parse(String(req.params.type));
  const id = String(req.params.id);
  const db = getDb();
  const context = readContext(db, req.user!.councilId, type, id);
  if (context === undefined) throw new HttpError(404, "Datensatz nicht gefunden.");
  const linked = new Set((db.prepare("SELECT provision_id FROM entity_legal_links WHERE council_id=? AND entity_type=? AND entity_id=?").all(req.user!.councilId, type, id) as Array<{ provision_id: string }>).map(row => row.provision_id));
  const items = suggestLegalSections(type, context).filter(item => !linked.has(item.provision.id)).map(item => ({ ...item.provision, text: undefined, plainSummary: provisionSummary(item.provision), reason: item.reason }));
  res.json({ items });
});

router.post("/legal/links", permit("links:write"), (req: AuthRequest, res) => {
  const data = z.object({ entityType, entityId: z.string().uuid(), provisionIds: z.array(z.string().trim().min(1).max(20)).min(1).max(30) }).parse(req.body);
  const db = getDb();
  const councilId = req.user!.councilId;
  if (readContext(db, councilId, data.entityType, data.entityId) === undefined) throw new HttpError(404, "Datensatz nicht gefunden.");
  const ids = [...new Set(data.provisionIds.map(id => id.replace(/^§\s*/, "")))];
  if (ids.some(id => !findProvision(id))) throw new HttpError(400, "Mindestens eine BetrVG-Vorschrift ist unbekannt.");
  const insert = db.prepare("INSERT OR IGNORE INTO entity_legal_links (id,council_id,entity_type,entity_id,provision_id,created_by) VALUES (?,?,?,?,?,?)");
  const count = db.transaction(() => ids.reduce((total, provisionId) => total + Number(insert.run(randomUUID(), councilId, data.entityType, data.entityId, provisionId, req.user!.id).changes), 0))();
  audit(db, req, "legal_basis_linked", data.entityType, data.entityId, { provisionIds: ids });
  res.status(201).json({ count });
});

router.delete("/legal/links/:id", permit("links:write"), (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const db = getDb();
  const result = db.prepare("DELETE FROM entity_legal_links WHERE id=? AND council_id=?").run(id, req.user!.councilId);
  if (!result.changes) throw new HttpError(404, "Rechtsgrundlagen-Zuordnung nicht gefunden.");
  audit(db, req, "legal_basis_unlinked", "entity_legal_link", id);
  res.status(204).end();
});

router.get("/procedure-templates", (_req, res) => {
  res.json({ items: procedureTemplates });
});

router.get("/procedure-templates/:id", (req, res) => {
  const item = getProcedureTemplate(String(req.params.id));
  if (!item) throw new HttpError(404, "Standardverfahren nicht gefunden.");
  res.json({ item });
});

router.post("/procedure-templates/:id/start", permit("cases:write"), (req: AuthRequest, res) => {
  const template = getProcedureTemplate(String(req.params.id));
  if (!template) throw new HttpError(404, "Standardverfahren nicht gefunden.");
  const data = z.object({
    title: z.string().trim().min(3).max(200).optional(),
    receivedAt: z.string().max(40).optional().nullable().transform(value => value || null),
    responsibleId: z.string().uuid().optional().nullable().transform(value => value || null),
    meetingId: z.string().uuid().optional().nullable().transform(value => value || null),
  }).parse(req.body);
  const db = getDb();
  const councilId = req.user!.councilId;
  if (data.responsibleId && !db.prepare("SELECT id FROM users WHERE id=? AND council_id=? AND active=1").get(data.responsibleId, councilId)) throw new HttpError(400, "Verantwortliches Mitglied gehört nicht zu diesem Gremium.");
  if (data.meetingId && !db.prepare("SELECT id FROM meetings WHERE id=? AND council_id=?").get(data.meetingId, councilId)) throw new HttpError(400, "Sitzung gehört nicht zu diesem Gremium.");
  const base = data.receivedAt ? new Date(data.receivedAt) : new Date();
  if (Number.isNaN(base.getTime())) throw new HttpError(400, "Der Eingangszeitpunkt ist ungültig.");
  const dueAt = template.deadlineDays === undefined ? null : new Date(base.getTime() + template.deadlineDays * 86_400_000).toISOString();
  const year = base.getUTCFullYear();
  const number = (db.prepare("SELECT COUNT(*) count FROM cases WHERE council_id=? AND strftime('%Y',created_at)=?").get(councilId, String(year)) as { count: number }).count + 1;
  const reference = `V-${year}-${String(number).padStart(3, "0")}`;
  const caseId = randomUUID();
  const title = data.title || template.title;
  const description = `${template.situation}\n\nIn einfachen Worten:\n${template.plainLanguage}\n\nZuerst klären:\n${template.firstQuestion}\n\nHinweis zur Frist:\n${template.deadlineNote}`;
  const insertTask = db.prepare("INSERT INTO tasks (id,council_id,title,description,status,priority,due_at,assigned_to,case_id,workflow_step,created_by) VALUES (?,?,?,?,'offen',?,?,?,?,?,?)");
  const insertLink = db.prepare("INSERT OR IGNORE INTO entity_legal_links (id,council_id,entity_type,entity_id,provision_id,created_by) VALUES (?,?,?,?,?,?)");
  db.transaction(() => {
    db.prepare(`INSERT INTO cases (id,council_id,reference,title,category,legal_basis,description,status,priority,received_at,due_at,responsible_id,confidentiality,procedure_template_id,created_by)
      VALUES (?,?,?,?,?,?,?,'neu',?,?,?,?,?,?,?)`).run(caseId, councilId, reference, title, template.category, template.legalSections.map(id => `§ ${id} BetrVG`).join(", "), description, template.riskLevel, base.toISOString(), dueAt, data.responsibleId, "gremium", template.id, req.user!.id);
    template.steps.forEach((workflow, index) => {
      const taskDue = workflow.offsetDays === undefined ? null : new Date(base.getTime() + workflow.offsetDays * 86_400_000).toISOString();
      insertTask.run(randomUUID(), councilId, `${index + 1}. ${workflow.title}`, workflow.description, workflow.priority ?? "normal", taskDue, data.responsibleId, caseId, workflow.key, req.user!.id);
    });
    for (const provisionId of template.legalSections) insertLink.run(randomUUID(), councilId, "case", caseId, provisionId, req.user!.id);
    if (data.meetingId) {
      const position = (db.prepare("SELECT COALESCE(MAX(position),0)+1 position FROM agenda_items WHERE meeting_id=?").get(data.meetingId) as { position: number }).position;
      db.prepare("INSERT INTO agenda_items (id,meeting_id,position,title,description,kind,case_id,duration_minutes,is_confidential) VALUES (?,?,?,?,?,'beratung',?,30,0)").run(randomUUID(), data.meetingId, position, title, `Geführtes Standardverfahren: ${template.title}`, caseId);
    }
    if (data.responsibleId) notify(db, councilId, data.responsibleId, "procedure_assigned", `Standardverfahren ${reference}`, `${template.title} · ${template.steps.length} Arbeitsschritte`, `/vorgaenge?open=${caseId}`);
  })();
  audit(db, req, "procedure_started", "case", caseId, { reference, templateId: template.id, steps: template.steps.length, meetingId: data.meetingId });
  res.status(201).json({ id: caseId, reference, taskCount: template.steps.length, dueAt });
});

export default router;
