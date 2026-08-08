import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "../database.js";
import { audit } from "../audit.js";
import { permit } from "../auth.js";
import { HttpError } from "../http.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const routeParam=(req:AuthRequest,key:string)=>String(req.params[key]);
const isoOptional = z.string().max(40).optional().nullable().transform((value) => value || null);
const text = z.string().trim().max(5000);

function ref(prefix: string): string {
  const year = new Date().getUTCFullYear();
  const row = getDb().prepare(`SELECT COUNT(*) AS count FROM ${prefix === "V" ? "cases" : prefix === "A" ? "inquiries" : "agreements"} WHERE strftime('%Y', created_at)=?`).get(String(year)) as { count: number };
  return `${prefix}-${year}-${String(row.count + 1).padStart(3, "0")}`;
}

router.get("/dashboard", (req: AuthRequest, res) => {
  const db = getDb();
  const council = req.user!.councilId;
  const scalar = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as { count: number }).count;
  const stats = {
    openCases: scalar("SELECT COUNT(*) count FROM cases WHERE council_id=? AND status NOT IN ('erledigt','archiviert')", council),
    dueSoon: scalar("SELECT COUNT(*) count FROM cases WHERE council_id=? AND due_at BETWEEN datetime('now') AND datetime('now','+7 day') AND status NOT IN ('erledigt','archiviert')", council),
    openTasks: scalar("SELECT COUNT(*) count FROM tasks WHERE council_id=? AND status<>'erledigt'", council),
    openInquiries: scalar("SELECT COUNT(*) count FROM inquiries WHERE council_id=? AND status NOT IN ('erledigt','archiviert')", council),
    activeAgreements: scalar("SELECT COUNT(*) count FROM agreements WHERE council_id=? AND status IN ('gueltig','verhandlung')", council),
    documents: scalar("SELECT COUNT(*) count FROM documents WHERE council_id=?", council),
  };
  const meetings = db.prepare(`SELECT m.*, c.name committee_name FROM meetings m LEFT JOIN committees c ON c.id=m.committee_id
    WHERE m.council_id=? AND m.starts_at>=datetime('now','-1 day') ORDER BY m.starts_at LIMIT 5`).all(council);
  const deadlines = db.prepare(`SELECT id, reference, title, due_at, priority, 'case' entity_type FROM cases
    WHERE council_id=? AND due_at IS NOT NULL AND status NOT IN ('erledigt','archiviert')
    UNION ALL SELECT id, '', title, due_at, priority, 'task' FROM tasks WHERE council_id=? AND due_at IS NOT NULL AND status<>'erledigt'
    ORDER BY due_at LIMIT 8`).all(council, council);
  const activity = db.prepare(`SELECT a.*, u.first_name, u.last_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.council_id=? ORDER BY a.created_at DESC LIMIT 8`).all(council);
  res.json({ stats, meetings, deadlines, activity });
});

const caseSchema = z.object({
  title: z.string().trim().min(3).max(200), category: z.string().min(1).max(80), legalBasis: text.optional().default(""),
  description: text.optional().default(""), status: z.string().max(40).optional().default("neu"),
  priority: z.enum(["niedrig", "normal", "hoch", "kritisch"]).optional().default("normal"),
  receivedAt: isoOptional, dueAt: isoOptional, responsibleId: isoOptional,
});

router.get("/cases", (req: AuthRequest, res) => {
  const rows = getDb().prepare(`SELECT c.*, u.first_name responsible_first_name, u.last_name responsible_last_name
    FROM cases c LEFT JOIN users u ON u.id=c.responsible_id WHERE c.council_id=? ORDER BY COALESCE(c.due_at,'9999'), c.created_at DESC`).all(req.user!.councilId);
  res.json({ items: rows });
});

router.post("/cases", permit("cases:write"), (req: AuthRequest, res) => {
  const data = caseSchema.parse(req.body); const id = randomUUID(); const reference = ref("V"); const db = getDb();
  db.prepare(`INSERT INTO cases (id,council_id,reference,title,category,legal_basis,description,status,priority,received_at,due_at,responsible_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.user!.councilId, reference, data.title, data.category, data.legalBasis, data.description, data.status, data.priority, data.receivedAt, data.dueAt, data.responsibleId, req.user!.id);
  audit(db, req, "created", "case", id, { reference, title: data.title });
  res.status(201).json({ id, reference });
});

router.patch("/cases/:id", permit("cases:write"), (req: AuthRequest, res) => {
  const data = caseSchema.partial().parse(req.body); const db = getDb();
  const existing = db.prepare("SELECT * FROM cases WHERE id=? AND council_id=?").get(routeParam(req,"id"), req.user!.councilId) as Record<string, unknown> | undefined;
  if (!existing) throw new HttpError(404, "Vorgang nicht gefunden.");
  const map: Record<string, string> = { title:"title", category:"category", legalBasis:"legal_basis", description:"description", status:"status", priority:"priority", receivedAt:"received_at", dueAt:"due_at", responsibleId:"responsible_id" };
  const entries = Object.entries(data).filter(([key]) => map[key]);
  if (entries.length) db.prepare(`UPDATE cases SET ${entries.map(([key]) => `${map[key]}=?`).join(",")}, updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?`).run(...entries.map(([,v])=>v), routeParam(req,"id"), req.user!.councilId);
  audit(db, req, "updated", "case", routeParam(req,"id"), { fields: entries.map(([key])=>key) });
  res.status(204).end();
});

const taskSchema = z.object({
  title: z.string().trim().min(3).max(200), description: text.optional().default(""),
  status: z.enum(["offen", "in_arbeit", "wartet", "erledigt"]).optional().default("offen"),
  priority: z.enum(["niedrig", "normal", "hoch", "kritisch"]).optional().default("normal"),
  dueAt: isoOptional, assignedTo: isoOptional, caseId: isoOptional, meetingId: isoOptional,
});

router.get("/tasks", (req: AuthRequest, res) => {
  const rows = getDb().prepare(`SELECT t.*, u.first_name assigned_first_name, u.last_name assigned_last_name, c.reference case_reference
    FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN cases c ON c.id=t.case_id
    WHERE t.council_id=? ORDER BY CASE t.status WHEN 'offen' THEN 1 WHEN 'in_arbeit' THEN 2 WHEN 'wartet' THEN 3 ELSE 4 END, COALESCE(t.due_at,'9999')`).all(req.user!.councilId);
  res.json({ items: rows });
});

router.post("/tasks", permit("tasks:write"), (req: AuthRequest, res) => {
  const data=taskSchema.parse(req.body); const id=randomUUID(); const db=getDb();
  db.prepare(`INSERT INTO tasks (id,council_id,title,description,status,priority,due_at,assigned_to,case_id,meeting_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.user!.councilId,data.title,data.description,data.status,data.priority,data.dueAt,data.assignedTo,data.caseId,data.meetingId,req.user!.id);
  audit(db,req,"created","task",id,{title:data.title}); res.status(201).json({id});
});

router.patch("/tasks/:id", permit("tasks:write"), (req: AuthRequest, res) => {
  const data=taskSchema.partial().parse(req.body); const db=getDb();
  if (!db.prepare("SELECT id FROM tasks WHERE id=? AND council_id=?").get(routeParam(req,"id"),req.user!.councilId)) throw new HttpError(404,"Aufgabe nicht gefunden.");
  const map:Record<string,string>={title:"title",description:"description",status:"status",priority:"priority",dueAt:"due_at",assignedTo:"assigned_to",caseId:"case_id",meetingId:"meeting_id"};
  const entries=Object.entries(data).filter(([key])=>map[key]);
  if(entries.length) db.prepare(`UPDATE tasks SET ${entries.map(([key])=>`${map[key]}=?`).join(",")}, completed_at=CASE WHEN ?='erledigt' THEN CURRENT_TIMESTAMP ELSE completed_at END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?`).run(...entries.map(([,v])=>v),data.status??"",routeParam(req,"id"),req.user!.councilId);
  audit(db,req,"updated","task",routeParam(req,"id"),{fields:entries.map(([k])=>k)}); res.status(204).end();
});

const inquirySchema=z.object({
  subject:z.string().trim().min(3).max(200),requesterName:z.string().trim().min(2).max(150),requesterContact:text.optional().default(""),
  channel:z.string().max(40).optional().default("persoenlich"),category:z.string().max(80).optional().default("beratung"),description:text.min(3),
  consentRecorded:z.boolean().optional().default(false),status:z.string().max(40).optional().default("neu"),assignedTo:isoOptional,dueAt:isoOptional,outcome:text.optional().default("")
});

router.get("/inquiries", (req:AuthRequest,res)=>{
  const rows=getDb().prepare(`SELECT i.*,u.first_name assigned_first_name,u.last_name assigned_last_name FROM inquiries i LEFT JOIN users u ON u.id=i.assigned_to WHERE i.council_id=? ORDER BY COALESCE(i.due_at,'9999'),i.created_at DESC`).all(req.user!.councilId);res.json({items:rows});
});
router.post("/inquiries",permit("inquiries:write"),(req:AuthRequest,res)=>{
  const d=inquirySchema.parse(req.body),id=randomUUID(),reference=ref("A"),db=getDb();
  db.prepare(`INSERT INTO inquiries (id,council_id,reference,subject,requester_name,requester_contact,channel,category,description,consent_recorded,status,assigned_to,due_at,outcome,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.user!.councilId,reference,d.subject,d.requesterName,d.requesterContact,d.channel,d.category,d.description,d.consentRecorded?1:0,d.status,d.assignedTo,d.dueAt,d.outcome,req.user!.id);
  audit(db,req,"created","inquiry",id,{reference,subject:d.subject});res.status(201).json({id,reference});
});
router.patch("/inquiries/:id",permit("inquiries:write"),(req:AuthRequest,res)=>{
  const d=inquirySchema.partial().parse(req.body),db=getDb();if(!db.prepare("SELECT id FROM inquiries WHERE id=? AND council_id=?").get(routeParam(req,"id"),req.user!.councilId))throw new HttpError(404,"Anfrage nicht gefunden.");
  const map:Record<string,string>={subject:"subject",requesterName:"requester_name",requesterContact:"requester_contact",channel:"channel",category:"category",description:"description",consentRecorded:"consent_recorded",status:"status",assignedTo:"assigned_to",dueAt:"due_at",outcome:"outcome"};const e=Object.entries(d).filter(([k])=>map[k]);if(e.length)db.prepare(`UPDATE inquiries SET ${e.map(([k])=>`${map[k]}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?`).run(...e.map(([k,v])=>k==="consentRecorded"?(v?1:0):v),routeParam(req,"id"),req.user!.councilId);audit(db,req,"updated","inquiry",routeParam(req,"id"));res.status(204).end();
});

const agreementSchema=z.object({
  title:z.string().trim().min(3).max(200),category:z.string().max(80).optional().default("sonstiges"),status:z.string().max(40).optional().default("entwurf"),
  validFrom:isoOptional,validUntil:isoOptional,noticePeriod:text.optional().default(""),afterEffect:z.boolean().optional().default(false),ownerId:isoOptional,summary:text.optional().default(""),reviewAt:isoOptional
});
router.get("/agreements",(req:AuthRequest,res)=>{const rows=getDb().prepare(`SELECT a.*,u.first_name owner_first_name,u.last_name owner_last_name FROM agreements a LEFT JOIN users u ON u.id=a.owner_id WHERE a.council_id=? ORDER BY a.title`).all(req.user!.councilId);res.json({items:rows});});
router.post("/agreements",permit("agreements:write"),(req:AuthRequest,res)=>{const d=agreementSchema.parse(req.body),id=randomUUID(),reference=ref("BV"),db=getDb();db.prepare(`INSERT INTO agreements (id,council_id,reference,title,category,status,valid_from,valid_until,notice_period,after_effect,owner_id,summary,review_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.user!.councilId,reference,d.title,d.category,d.status,d.validFrom,d.validUntil,d.noticePeriod,d.afterEffect?1:0,d.ownerId,d.summary,d.reviewAt,req.user!.id);audit(db,req,"created","agreement",id,{reference,title:d.title});res.status(201).json({id,reference});});
router.patch("/agreements/:id",permit("agreements:write"),(req:AuthRequest,res)=>{const d=agreementSchema.partial().parse(req.body),db=getDb();if(!db.prepare("SELECT id FROM agreements WHERE id=? AND council_id=?").get(routeParam(req,"id"),req.user!.councilId))throw new HttpError(404,"Vereinbarung nicht gefunden.");const map:Record<string,string>={title:"title",category:"category",status:"status",validFrom:"valid_from",validUntil:"valid_until",noticePeriod:"notice_period",afterEffect:"after_effect",ownerId:"owner_id",summary:"summary",reviewAt:"review_at"};const e=Object.entries(d).filter(([k])=>map[k]);if(e.length)db.prepare(`UPDATE agreements SET ${e.map(([k])=>`${map[k]}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?`).run(...e.map(([k,v])=>k==="afterEffect"?(v?1:0):v),routeParam(req,"id"),req.user!.councilId);audit(db,req,"updated","agreement",routeParam(req,"id"));res.status(204).end();});

router.get("/decisions",(req:AuthRequest,res)=>{const rows=getDb().prepare(`SELECT d.*,m.title meeting_title,c.reference case_reference FROM decisions d JOIN meetings m ON m.id=d.meeting_id LEFT JOIN cases c ON c.id=d.case_id WHERE d.council_id=? ORDER BY d.decided_at DESC`).all(req.user!.councilId);res.json({items:rows});});

router.get("/search",(req:AuthRequest,res)=>{
  const q=String(req.query.q||"").trim();if(q.length<2){res.json({items:[]});return;}const like=`%${q}%`,c=req.user!.councilId,db=getDb();
  const items=db.prepare(`SELECT id,reference,title,'Vorgang' type,'/vorgaenge' url FROM cases WHERE council_id=? AND (title LIKE ? OR reference LIKE ? OR description LIKE ?)
    UNION ALL SELECT id,'',title,'Aufgabe','/aufgaben' FROM tasks WHERE council_id=? AND (title LIKE ? OR description LIKE ?)
    UNION ALL SELECT id,reference,subject,'Anfrage','/anfragen' FROM inquiries WHERE council_id=? AND (subject LIKE ? OR reference LIKE ? OR description LIKE ?)
    UNION ALL SELECT id,reference,title,'Vereinbarung','/vereinbarungen' FROM agreements WHERE council_id=? AND (title LIKE ? OR reference LIKE ? OR summary LIKE ?) LIMIT 30`)
    .all(c,like,like,like,c,like,like,c,like,like,like,c,like,like,like);res.json({items});
});

export default router;
