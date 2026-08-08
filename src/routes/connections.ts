import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { permit } from "../auth.js";
import { getDb, type SqliteDatabase } from "../database.js";
import { HttpError } from "../http.js";
import { notify } from "../notifications.js";
import type { AuthRequest } from "../types.js";

const router=Router();
const entityType=z.enum(["case","task","inquiry","agreement","decision","document","meeting","training","member","committee"]);
type EntityType=z.infer<typeof entityType>;
interface Definition{table:string;title:string;reference:string;status:string;url:string;label:string}
const definitions:Record<EntityType,Definition>={
  case:{table:"cases",title:"title",reference:"reference",status:"status",url:"/vorgaenge?open=",label:"Vorgang"},
  task:{table:"tasks",title:"title",reference:"''",status:"status",url:"/aufgaben?open=",label:"Aufgabe"},
  inquiry:{table:"inquiries",title:"subject",reference:"reference",status:"status",url:"/anfragen?open=",label:"Mitarbeiteranfrage"},
  agreement:{table:"agreements",title:"title",reference:"reference",status:"status",url:"/vereinbarungen?open=",label:"Vereinbarung"},
  decision:{table:"decisions",title:"title",reference:"reference",status:"result",url:"/beschluesse?open=",label:"Beschluss"},
  document:{table:"documents",title:"title",reference:"folder",status:"category",url:"/dokumente?open=",label:"Dokument"},
  meeting:{table:"meetings",title:"title",reference:"'Sitzung ' || sequence_no",status:"status",url:"/sitzungen/",label:"Sitzung"},
  training:{table:"trainings",title:"title",reference:"provider",status:"status",url:"/seminare?open=",label:"Seminar"},
  member:{table:"users",title:"first_name || ' ' || last_name",reference:"email",status:"role",url:"/gremium?member=",label:"Mitglied"},
  committee:{table:"committees",title:"name",reference:"''",status:"kind",url:"/gremium?committee=",label:"Gremium"},
};
interface EntityRow{id:string;title:string;reference:string;status:string}
interface ConnectionRow{id:string;source_type:EntityType;source_id:string;target_type:EntityType;target_id:string;relation:string;created_at:string}

function readEntity(db:SqliteDatabase,councilId:string,type:EntityType,id:string):EntityRow|undefined{
  const definition=definitions[type];
  return db.prepare(`SELECT id,${definition.title} title,${definition.reference} reference,${definition.status} status FROM ${definition.table} WHERE id=? AND council_id=?`).get(id,councilId) as EntityRow|undefined;
}
function canonical(leftType:EntityType,leftId:string,rightType:EntityType,rightId:string){
  const left=`${leftType}:${leftId}`,right=`${rightType}:${rightId}`;
  return left.localeCompare(right)<=0?{sourceType:leftType,sourceId:leftId,targetType:rightType,targetId:rightId}:{sourceType:rightType,sourceId:rightId,targetType:leftType,targetId:leftId};
}
function requestedType(req:AuthRequest,key:string):EntityType{return entityType.parse(String(req.params[key]));}

router.get("/connections/options/:type",(req:AuthRequest,res)=>{
  const type=requestedType(req,"type"),definition=definitions[type],query=String(req.query.q||"").trim(),like=`%${query}%`;
  const items=getDb().prepare(`SELECT id,${definition.title} title,${definition.reference} reference,${definition.status} status FROM ${definition.table} WHERE council_id=? AND (?='' OR ${definition.title} LIKE ? OR ${definition.reference} LIKE ?) ORDER BY ${definition.title} LIMIT 100`).all(req.user!.councilId,query,like,like);
  res.json({items,label:definition.label});
});

router.get("/connections/:type/:id",(req:AuthRequest,res)=>{
  const db=getDb(),type=requestedType(req,"type"),id=String(req.params.id),councilId=req.user!.councilId;
  if(!readEntity(db,councilId,type,id))throw new HttpError(404,"Ausgangsdatensatz nicht gefunden.");
  const rows=db.prepare(`SELECT id,source_type,source_id,target_type,target_id,relation,created_at FROM entity_connections WHERE council_id=? AND ((source_type=? AND source_id=?) OR (target_type=? AND target_id=?)) ORDER BY created_at DESC`).all(councilId,type,id,type,id) as ConnectionRow[];
  const items=rows.flatMap(row=>{const otherType=row.source_type===type&&row.source_id===id?row.target_type:row.source_type,otherId=row.source_type===type&&row.source_id===id?row.target_id:row.source_id,entity=readEntity(db,councilId,otherType,otherId);return entity?[{connectionId:row.id,type:otherType,typeLabel:definitions[otherType].label,...entity,relation:row.relation,createdAt:row.created_at,url:`${definitions[otherType].url}${entity.id}`}]:[];});
  res.json({items});
});

router.post("/connections",permit("links:write"),(req:AuthRequest,res)=>{
  const data=z.object({sourceType:entityType,sourceId:z.string().uuid(),targetType:entityType,targetId:z.string().uuid(),relation:z.string().trim().min(2).max(160).optional().default("Thematischer Zusammenhang")}).parse(req.body),db=getDb(),councilId=req.user!.councilId;
  if(data.sourceType===data.targetType&&data.sourceId===data.targetId)throw new HttpError(400,"Ein Datensatz kann nicht mit sich selbst verknüpft werden.");
  if(!readEntity(db,councilId,data.sourceType,data.sourceId)||!readEntity(db,councilId,data.targetType,data.targetId))throw new HttpError(404,"Mindestens ein Datensatz wurde nicht gefunden.");
  const pair=canonical(data.sourceType,data.sourceId,data.targetType,data.targetId),id=randomUUID();
  db.prepare("INSERT INTO entity_connections (id,council_id,source_type,source_id,target_type,target_id,relation,created_by) VALUES (?,?,?,?,?,?,?,?)").run(id,councilId,pair.sourceType,pair.sourceId,pair.targetType,pair.targetId,data.relation,req.user!.id);
  audit(db,req,"linked","entity_connection",id,{...pair,relation:data.relation});res.status(201).json({id});
});

router.delete("/connections/:id",permit("links:write"),(req:AuthRequest,res)=>{
  const db=getDb(),id=String(req.params.id),result=db.prepare("DELETE FROM entity_connections WHERE id=? AND council_id=?").run(id,req.user!.councilId);
  if(!result.changes)throw new HttpError(404,"Verknüpfung nicht gefunden.");audit(db,req,"unlinked","entity_connection",id);res.status(204).end();
});

router.post("/connections/:type/:id/tasks",permit("tasks:write"),(req:AuthRequest,res)=>{
  const type=requestedType(req,"type"),sourceId=String(req.params.id),data=z.object({title:z.string().trim().min(3).max(200),description:z.string().max(5000).optional().default(""),priority:z.enum(["niedrig","normal","hoch","kritisch"]).optional().default("normal"),dueAt:z.string().max(40).optional().nullable().transform(value=>value||null),assignedTo:z.string().uuid().optional().nullable().transform(value=>value||null)}).parse(req.body),db=getDb(),councilId=req.user!.councilId;
  const source=readEntity(db,councilId,type,sourceId);if(!source)throw new HttpError(404,"Ausgangsdatensatz nicht gefunden.");
  if(data.assignedTo&&!readEntity(db,councilId,"member",data.assignedTo))throw new HttpError(400,"Zuständiges Mitglied wurde nicht gefunden.");
  const taskId=randomUUID(),pair=canonical(type,sourceId,"task",taskId),connectionId=randomUUID();
  db.transaction(()=>{
    db.prepare(`INSERT INTO tasks (id,council_id,title,description,status,priority,due_at,assigned_to,case_id,meeting_id,created_by) VALUES (?,?,?,?,'offen',?,?,?,?,?,?)`).run(taskId,councilId,data.title,data.description,data.priority,data.dueAt,data.assignedTo,type==="case"?sourceId:null,type==="meeting"?sourceId:null,req.user!.id);
    db.prepare("INSERT INTO entity_connections (id,council_id,source_type,source_id,target_type,target_id,relation,created_by) VALUES (?,?,?,?,?,?,?,?)").run(connectionId,councilId,pair.sourceType,pair.sourceId,pair.targetType,pair.targetId,"Folgeaufgabe",req.user!.id);
    if(data.assignedTo)notify(db,councilId,data.assignedTo,"task_assigned","Neue Folgeaufgabe",`${data.title} · aus ${definitions[type].label} ${source.reference||source.title}`,`/aufgaben?open=${taskId}`);
  })();
  audit(db,req,"created","task",taskId,{title:data.title,contextType:type,contextId:sourceId});res.status(201).json({id:taskId});
});

export default router;
