import { Router } from "express";
import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { audit } from "../audit.js";
import { permit } from "../auth.js";
import { getDb } from "../database.js";
import { HttpError } from "../http.js";
import type { AuthRequest } from "../types.js";
import { notify } from "../notifications.js";

const router = Router();
const routeParam=(req:AuthRequest,key:string)=>String(req.params[key]);
const nullableId = z.string().uuid().optional().nullable().transform(v => v || null);
const nullableText = z.string().max(5000).optional().nullable().transform(v => v || null);
const meetingSchema = z.object({
  title: z.string().trim().min(3).max(200),
  committeeId: nullableId,
  kind: z.enum(["ordentlich", "ausserordentlich", "hybrid", "video"]).optional().default("ordentlich"),
  startsAt: z.string().min(10).max(40), endsAt: z.string().min(10).max(40),
  location: z.string().max(300).optional().default(""), videoLink: z.string().max(1000).optional().default(""),
  status: z.enum(["entwurf", "geplant", "eingeladen", "laufend", "abgeschlossen", "abgesagt"]).optional().default("entwurf"),
  chairId: nullableId, secretaryId: nullableId, minutes: z.string().max(100000).optional().default(""),
  minutesStatus: z.enum(["entwurf", "zur_pruefung", "freigegeben", "unterzeichnet"]).optional().default("entwurf"),
});

router.get("/meetings", (req: AuthRequest, res) => {
  const items = getDb().prepare(`SELECT m.*,c.name committee_name,
    (SELECT COUNT(*) FROM agenda_items a WHERE a.meeting_id=m.id) agenda_count,
    (SELECT COUNT(*) FROM meeting_attendees ma WHERE ma.meeting_id=m.id AND ma.attendance='anwesend') attendee_count
    FROM meetings m LEFT JOIN committees c ON c.id=m.committee_id WHERE m.council_id=? ORDER BY m.starts_at DESC`).all(req.user!.councilId);
  res.json({ items });
});

router.get("/meetings/:id", (req: AuthRequest, res) => {
  const db = getDb(), council = req.user!.councilId;
  const meeting = db.prepare(`SELECT m.*,c.name committee_name FROM meetings m LEFT JOIN committees c ON c.id=m.committee_id WHERE m.id=? AND m.council_id=?`).get(routeParam(req,"id"), council);
  if (!meeting) throw new HttpError(404, "Sitzung nicht gefunden.");
  const agenda = db.prepare(`SELECT a.*,c.reference case_reference FROM agenda_items a LEFT JOIN cases c ON c.id=a.case_id WHERE a.meeting_id=? ORDER BY a.position`).all(routeParam(req,"id"));
  const attendees = db.prepare(`SELECT ma.*,u.first_name,u.last_name,u.role,u.position FROM meeting_attendees ma JOIN users u ON u.id=ma.user_id WHERE ma.meeting_id=? ORDER BY u.last_name,u.first_name`).all(routeParam(req,"id"));
  const decisions = db.prepare("SELECT * FROM decisions WHERE meeting_id=? ORDER BY created_at").all(routeParam(req,"id"));
  res.json({ meeting, agenda, attendees, decisions });
});

router.post("/meetings", permit("meetings:write"), (req: AuthRequest, res) => {
  const d=meetingSchema.parse(req.body),db=getDb(),id=randomUUID(),c=req.user!.councilId;
  if(new Date(d.endsAt)<=new Date(d.startsAt))throw new HttpError(400,"Das Ende muss nach dem Beginn liegen.");
  const sequence=((db.prepare("SELECT COALESCE(MAX(sequence_no),0)+1 n FROM meetings WHERE council_id=?").get(c) as {n:number}).n);
  db.transaction(()=>{
    db.prepare(`INSERT INTO meetings (id,council_id,committee_id,sequence_no,title,kind,starts_at,ends_at,location,video_link,status,minutes,minutes_status,chair_id,secretary_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,c,d.committeeId,sequence,d.title,d.kind,d.startsAt,d.endsAt,d.location,d.videoLink,d.status,d.minutes,d.minutesStatus,d.chairId,d.secretaryId,req.user!.id);
    const members=d.committeeId
      ? db.prepare(`SELECT u.id FROM users u JOIN committee_members cm ON cm.user_id=u.id WHERE cm.committee_id=? AND u.active=1`).all(d.committeeId) as {id:string}[]
      : db.prepare("SELECT id FROM users WHERE council_id=? AND active=1 AND role NOT IN ('ersatzmitglied','lesezugriff')").all(c) as {id:string}[];
    const add=db.prepare("INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id) VALUES (?,?)");
    for(const member of members){add.run(id,member.id);notify(db,c,member.id,"meeting_invitation",`Neue Sitzung: ${d.title}`,new Date(d.startsAt).toLocaleString("de-DE"),`/sitzungen/${id}`);}
  })();
  audit(db,req,"created","meeting",id,{sequence,title:d.title});res.status(201).json({id,sequenceNo:sequence});
});

router.patch("/meetings/:id",permit("meetings:write"),(req:AuthRequest,res)=>{
  const d=meetingSchema.partial().parse(req.body),db=getDb(),c=req.user!.councilId;
  if(!db.prepare("SELECT id FROM meetings WHERE id=? AND council_id=?").get(routeParam(req,"id"),c))throw new HttpError(404,"Sitzung nicht gefunden.");
  const map:Record<string,string>={title:"title",committeeId:"committee_id",kind:"kind",startsAt:"starts_at",endsAt:"ends_at",location:"location",videoLink:"video_link",status:"status",chairId:"chair_id",secretaryId:"secretary_id",minutes:"minutes",minutesStatus:"minutes_status"};const e=Object.entries(d).filter(([k])=>map[k]);
  if(e.length)db.prepare(`UPDATE meetings SET ${e.map(([k])=>`${map[k]}=?`).join(",")},invitation_sent_at=CASE WHEN ?='eingeladen' THEN CURRENT_TIMESTAMP ELSE invitation_sent_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?`).run(...e.map(([,v])=>v),d.status??"",routeParam(req,"id"),c);
  audit(db,req,"updated","meeting",routeParam(req,"id"),{fields:e.map(([k])=>k)});res.status(204).end();
});

const agendaSchema=z.object({title:z.string().trim().min(3).max(300),description:z.string().max(10000).optional().default(""),kind:z.enum(["formal","information","beratung","beschluss"]).optional().default("beratung"),caseId:nullableId,durationMinutes:z.coerce.number().int().min(1).max(480).optional().default(15),isConfidential:z.boolean().optional().default(false)});
router.post("/meetings/:id/agenda",permit("meetings:write"),(req:AuthRequest,res)=>{
  const d=agendaSchema.parse(req.body),db=getDb(),c=req.user!.councilId;if(!db.prepare("SELECT id FROM meetings WHERE id=? AND council_id=?").get(routeParam(req,"id"),c))throw new HttpError(404,"Sitzung nicht gefunden.");const position=(db.prepare("SELECT COALESCE(MAX(position),0)+1 n FROM agenda_items WHERE meeting_id=?").get(routeParam(req,"id")) as {n:number}).n,id=randomUUID();db.prepare(`INSERT INTO agenda_items (id,meeting_id,position,title,description,kind,case_id,duration_minutes,is_confidential) VALUES (?,?,?,?,?,?,?,?,?)`).run(id,routeParam(req,"id"),position,d.title,d.description,d.kind,d.caseId,d.durationMinutes,d.isConfidential?1:0);audit(db,req,"created","agenda_item",id,{meetingId:routeParam(req,"id")});res.status(201).json({id,position});
});
router.patch("/meetings/:meetingId/agenda/:id",permit("meetings:write"),(req:AuthRequest,res)=>{const d=agendaSchema.partial().parse(req.body),db=getDb(),c=req.user!.councilId,meetingId=routeParam(req,"meetingId"),id=routeParam(req,"id");if(!db.prepare("SELECT id FROM meetings WHERE id=? AND council_id=?").get(meetingId,c))throw new HttpError(404,"Sitzung nicht gefunden.");if(!db.prepare("SELECT id FROM agenda_items WHERE id=? AND meeting_id=?").get(id,meetingId))throw new HttpError(404,"Tagesordnungspunkt nicht gefunden.");const map:Record<string,string>={title:"title",description:"description",kind:"kind",caseId:"case_id",durationMinutes:"duration_minutes",isConfidential:"is_confidential"},entries=Object.entries(d);if(entries.length)db.prepare(`UPDATE agenda_items SET ${entries.map(([key])=>`${map[key]}=?`).join(",")} WHERE id=? AND meeting_id=?`).run(...entries.map(([key,value])=>key==="isConfidential"?(value?1:0):value),id,meetingId);audit(db,req,"updated","agenda_item",id,{fields:entries.map(([key])=>key)});res.status(204).end();});
router.delete("/meetings/:meetingId/agenda/:id",permit("meetings:write"),(req:AuthRequest,res)=>{const db=getDb(),c=req.user!.councilId;const result=db.prepare("DELETE FROM agenda_items WHERE id=? AND meeting_id=? AND meeting_id IN (SELECT id FROM meetings WHERE council_id=?)").run(routeParam(req,"id"),routeParam(req,"meetingId"),c);if(!result.changes)throw new HttpError(404,"Tagesordnungspunkt nicht gefunden.");audit(db,req,"deleted","agenda_item",routeParam(req,"id"));res.status(204).end();});

router.patch("/meetings/:meetingId/attendance/:userId",permit("meetings:write"),(req:AuthRequest,res)=>{
  const d=z.object({invitationStatus:z.string().max(40).optional(),attendance:z.enum(["offen","anwesend","abwesend","verhindert"]).optional(),attendanceMode:z.enum(["praesenz","video","telefon"]).optional(),preventedReason:z.string().max(1000).optional(),signed:z.boolean().optional()}).parse(req.body),db=getDb(),c=req.user!.councilId;if(!db.prepare("SELECT id FROM meetings WHERE id=? AND council_id=?").get(routeParam(req,"meetingId"),c))throw new HttpError(404,"Sitzung nicht gefunden.");const map:Record<string,string>={invitationStatus:"invitation_status",attendance:"attendance",attendanceMode:"attendance_mode",preventedReason:"prevented_reason"};const e=Object.entries(d).filter(([k])=>map[k]);if(e.length)db.prepare(`UPDATE meeting_attendees SET ${e.map(([k])=>`${map[k]}=?`).join(",")} WHERE meeting_id=? AND user_id=?`).run(...e.map(([,v])=>v),routeParam(req,"meetingId"),routeParam(req,"userId"));if(d.signed!==undefined)db.prepare("UPDATE meeting_attendees SET signed_at=? WHERE meeting_id=? AND user_id=?").run(d.signed?new Date().toISOString():null,routeParam(req,"meetingId"),routeParam(req,"userId"));audit(db,req,"attendance_updated","meeting",routeParam(req,"meetingId"),{userId:routeParam(req,"userId")});res.status(204).end();
});

const decisionSchema=z.object({agendaItemId:nullableId,caseId:nullableId,title:z.string().trim().min(3).max(300),resolutionText:z.string().trim().min(3).max(20000),voteYes:z.coerce.number().int().min(0),voteNo:z.coerce.number().int().min(0),voteAbstain:z.coerce.number().int().min(0),eligibleVoters:z.coerce.number().int().min(0),votingMethod:z.enum(["offen","geheim","namentlich","umlauf"]).optional().default("offen"),decidedAt:z.string().max(40).optional().default(()=>new Date().toISOString())});
router.post("/meetings/:id/decisions",permit("meetings:write"),(req:AuthRequest,res)=>{
  const d=decisionSchema.parse(req.body),db=getDb(),c=req.user!.councilId;if(!db.prepare("SELECT id FROM meetings WHERE id=? AND council_id=?").get(routeParam(req,"id"),c))throw new HttpError(404,"Sitzung nicht gefunden.");const cast=d.voteYes+d.voteNo+d.voteAbstain;if(cast>d.eligibleVoters)throw new HttpError(400,"Es wurden mehr Stimmen abgegeben als Stimmberechtigte vorhanden sind.");const quorum=d.eligibleVoters>0&&cast>=(Math.floor(d.eligibleVoters/2)+1),result=quorum&&d.voteYes>d.voteNo?"angenommen":quorum?"abgelehnt":"nicht_beschlussfaehig",number=(db.prepare("SELECT COUNT(*) n FROM decisions WHERE council_id=? AND strftime('%Y',decided_at)=?").get(c,new Date(d.decidedAt).getUTCFullYear().toString()) as {n:number}).n+1,reference=`B-${new Date(d.decidedAt).getUTCFullYear()}-${String(number).padStart(3,"0")}`,id=randomUUID();db.transaction(()=>{db.prepare(`INSERT INTO decisions (id,council_id,meeting_id,agenda_item_id,case_id,reference,title,resolution_text,vote_yes,vote_no,vote_abstain,eligible_voters,quorum_met,result,voting_method,decided_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,c,routeParam(req,"id"),d.agendaItemId,d.caseId,reference,d.title,d.resolutionText,d.voteYes,d.voteNo,d.voteAbstain,d.eligibleVoters,quorum?1:0,result,d.votingMethod,d.decidedAt,req.user!.id);if(d.caseId)db.prepare("UPDATE cases SET status='beschlossen',updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?").run(d.caseId,c);notify(db,c,null,"decision_created",`${reference} · ${d.title}`,`Ergebnis: ${result}`,`/beschluesse?open=${id}`);})();audit(db,req,"created","decision",id,{reference,result});res.status(201).json({id,reference,result,quorumMet:quorum});
});

function escapeIcs(value:string):string{return value.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
function icsDate(value:string):string{return new Date(value).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");}
router.get("/calendar.ics",(req:AuthRequest,res)=>{const meetings=getDb().prepare("SELECT * FROM meetings WHERE council_id=? AND status<>'abgesagt' ORDER BY starts_at").all(req.user!.councilId) as Record<string,unknown>[];const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//BR Manager//DE","CALSCALE:GREGORIAN","METHOD:PUBLISH",...meetings.flatMap(m=>["BEGIN:VEVENT",`UID:${m.id}@br-manager`,`DTSTAMP:${icsDate(String(m.created_at))}`,`DTSTART:${icsDate(String(m.starts_at))}`,`DTEND:${icsDate(String(m.ends_at))}`,`SUMMARY:${escapeIcs(String(m.title))}`,`LOCATION:${escapeIcs(String(m.location))}`,"END:VEVENT"]),"END:VCALENDAR"];res.type("text/calendar; charset=utf-8").setHeader("Content-Disposition","attachment; filename=br-sitzungen.ics").send(lines.join("\r\n"));});

router.get("/meetings/:id/minutes.pdf",(req:AuthRequest,res)=>{
  const db=getDb(),c=req.user!.councilId,meeting=db.prepare(`SELECT m.*,co.name committee_name,ch.first_name||' '||ch.last_name chair_name,se.first_name||' '||se.last_name secretary_name FROM meetings m LEFT JOIN committees co ON co.id=m.committee_id LEFT JOIN users ch ON ch.id=m.chair_id LEFT JOIN users se ON se.id=m.secretary_id WHERE m.id=? AND m.council_id=?`).get(routeParam(req,"id"),c) as Record<string,unknown>|undefined;if(!meeting)throw new HttpError(404,"Sitzung nicht gefunden.");const agenda=db.prepare("SELECT * FROM agenda_items WHERE meeting_id=? ORDER BY position").all(routeParam(req,"id")) as Record<string,unknown>[],attendees=db.prepare(`SELECT u.first_name||' '||u.last_name name,ma.attendance,ma.attendance_mode FROM meeting_attendees ma JOIN users u ON u.id=ma.user_id WHERE ma.meeting_id=? ORDER BY u.last_name`).all(routeParam(req,"id")) as Record<string,unknown>[],decisions=db.prepare("SELECT * FROM decisions WHERE meeting_id=? ORDER BY created_at").all(routeParam(req,"id")) as Record<string,unknown>[];audit(db,req,"exported","meeting_minutes",routeParam(req,"id"));res.type("application/pdf").setHeader("Content-Disposition",`inline; filename=protokoll-${meeting.sequence_no}.pdf`);const pdf=new PDFDocument({size:"A4",margin:56,info:{Title:`Niederschrift ${meeting.title}`,Author:req.user!.councilName}});pdf.pipe(res);pdf.fontSize(9).fillColor("#55716b").text(req.user!.councilName);pdf.moveDown(.5).fontSize(22).fillColor("#142f2b").text(`Niederschrift · Sitzung ${meeting.sequence_no}`);pdf.fontSize(12).fillColor("#253d39").text(String(meeting.title));pdf.moveDown().fontSize(10).fillColor("#172622").text(`Beginn: ${new Date(String(meeting.starts_at)).toLocaleString("de-DE")}`).text(`Ort: ${meeting.location||"—"}`).text(`Gremium: ${meeting.committee_name||req.user!.councilName}`);pdf.moveDown().fontSize(14).fillColor("#142f2b").text("Teilnehmende");for(const a of attendees)pdf.fontSize(10).fillColor("#172622").text(`${a.attendance==="anwesend"?"✓":"○"} ${a.name} · ${a.attendance} (${a.attendance_mode})`);pdf.moveDown().fontSize(14).fillColor("#142f2b").text("Tagesordnung");for(const a of agenda)pdf.fontSize(11).fillColor("#172622").text(`${a.position}. ${a.title}`,{continued:false}).fontSize(9).fillColor("#55716b").text(String(a.description||""));if(decisions.length){pdf.moveDown().fontSize(14).fillColor("#142f2b").text("Beschlüsse");for(const d of decisions){pdf.fontSize(11).fillColor("#172622").text(`${d.reference} · ${d.title}`).fontSize(10).text(String(d.resolution_text)).fontSize(9).fillColor("#55716b").text(`Ergebnis: ${d.result} · Ja ${d.vote_yes} / Nein ${d.vote_no} / Enthaltung ${d.vote_abstain}`);pdf.moveDown(.5);}}pdf.moveDown().fontSize(14).fillColor("#142f2b").text("Verlauf / Notizen").fontSize(10).fillColor("#172622").text(String(meeting.minutes||"Keine Verlaufsnotizen erfasst."));pdf.moveDown(3).text("____________________________                    ____________________________").fontSize(9).text(`${meeting.chair_name||"Vorsitz"}                                                     ${meeting.secretary_name||"Weiteres Mitglied"}`);pdf.end();
});

export default router;
