import { Router } from "express";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { z } from "zod";
import { audit } from "../audit.js";
import { permit } from "../auth.js";
import { config } from "../config.js";
import { getDb } from "../database.js";
import { readEncrypted, storeEncrypted } from "../files.js";
import { HttpError } from "../http.js";
import type { AuthRequest } from "../types.js";

const router=Router();
const allowedMimeTypes=new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","image/png","image/jpeg"]);
const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:config.maxUploadBytes,files:1},
  fileFilter:(_req,file,cb)=>{
    if(allowedMimeTypes.has(file.mimetype))cb(null,true);
    else cb(new Error("Dateityp nicht erlaubt."));
  },
});
const routeParam=(req:AuthRequest,key:string)=>String(req.params[key]);

router.get("/documents",(req:AuthRequest,res)=>{const items=getDb().prepare(`SELECT d.*,v.version,v.original_name,v.mime_type,v.size,v.checksum,v.created_at version_created_at,u.first_name,u.last_name FROM documents d JOIN document_versions v ON v.document_id=d.id AND v.version=(SELECT MAX(v2.version) FROM document_versions v2 WHERE v2.document_id=d.id) LEFT JOIN users u ON u.id=d.created_by WHERE d.council_id=? ORDER BY d.folder,d.title`).all(req.user!.councilId);res.json({items});});

router.get("/documents/:id",(req:AuthRequest,res)=>{const db=getDb(),id=routeParam(req,"id"),c=req.user!.councilId,item=db.prepare(`SELECT d.*,u.first_name,u.last_name FROM documents d LEFT JOIN users u ON u.id=d.created_by WHERE d.id=? AND d.council_id=?`).get(id,c);if(!item)throw new HttpError(404,"Dokument nicht gefunden.");const versions=db.prepare(`SELECT v.id,v.version,v.original_name,v.mime_type,v.size,v.checksum,v.created_at,u.first_name,u.last_name FROM document_versions v LEFT JOIN users u ON u.id=v.uploaded_by WHERE v.document_id=? ORDER BY v.version DESC`).all(id);res.json({item,related:{versions}});});

router.patch("/documents/:id",permit("documents:write"),(req:AuthRequest,res)=>{const d=z.object({title:z.string().trim().min(2).max(250).optional(),folder:z.string().trim().min(1).max(250).optional(),category:z.string().trim().min(1).max(100).optional(),confidentiality:z.enum(["gremium","ausschuss","streng_vertraulich"]).optional(),retentionUntil:z.string().max(40).optional().nullable().transform(value=>value||null)}).parse(req.body),db=getDb(),id=routeParam(req,"id");if(!db.prepare("SELECT id FROM documents WHERE id=? AND council_id=?").get(id,req.user!.councilId))throw new HttpError(404,"Dokument nicht gefunden.");const map:Record<string,string>={title:"title",folder:"folder",category:"category",confidentiality:"confidentiality",retentionUntil:"retention_until"},entries=Object.entries(d);if(entries.length)db.prepare(`UPDATE documents SET ${entries.map(([key])=>`${map[key]}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=? AND council_id=?`).run(...entries.map(([,value])=>value),id,req.user!.councilId);audit(db,req,"updated","document",id,{fields:entries.map(([key])=>key)});res.status(204).end();});

router.post("/documents",permit("documents:write"),upload.single("file"),(req:AuthRequest,res)=>{
  const file=req.file;
  if(!file)throw new HttpError(400,"Bitte eine Datei auswählen.");
  const d=z.object({title:z.string().trim().min(2).max(250),folder:z.string().max(250).optional().default("Allgemein"),category:z.string().max(100).optional().default("sonstiges"),confidentiality:z.enum(["gremium","ausschuss","streng_vertraulich"]).optional().default("gremium"),caseId:z.string().uuid().optional().or(z.literal("")).transform(v=>v||null),meetingId:z.string().uuid().optional().or(z.literal("")).transform(v=>v||null),retentionUntil:z.string().max(40).optional().or(z.literal("")).transform(v=>v||null)}).parse(req.body);
  const db=getDb(),id=randomUUID(),versionId=randomUUID(),stored=storeEncrypted(file.buffer);
  db.transaction(()=>{
    db.prepare(`INSERT INTO documents (id,council_id,title,folder,category,confidentiality,case_id,meeting_id,retention_until,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,req.user!.councilId,d.title,d.folder,d.category,d.confidentiality,d.caseId,d.meetingId,d.retentionUntil,req.user!.id);
    db.prepare(`INSERT INTO document_versions (id,document_id,version,original_name,mime_type,size,storage_name,iv,auth_tag,checksum,uploaded_by) VALUES (?,?,1,?,?,?,?,?,?,?,?)`).run(versionId,id,file.originalname,file.mimetype,file.size,stored.storageName,stored.iv,stored.authTag,stored.checksum,req.user!.id);
  })();
  audit(db,req,"uploaded","document",id,{title:d.title,mime:file.mimetype,size:file.size,checksum:stored.checksum});res.status(201).json({id});
});

router.post("/documents/:id/versions",permit("documents:write"),upload.single("file"),(req:AuthRequest,res)=>{
  const file=req.file;
  if(!file)throw new HttpError(400,"Bitte eine Datei auswählen.");
  const db=getDb(),documentId=routeParam(req,"id"),doc=db.prepare("SELECT id FROM documents WHERE id=? AND council_id=?").get(documentId,req.user!.councilId);
  if(!doc)throw new HttpError(404,"Dokument nicht gefunden.");
  const version=(db.prepare("SELECT COALESCE(MAX(version),0)+1 n FROM document_versions WHERE document_id=?").get(documentId) as {n:number}).n,stored=storeEncrypted(file.buffer),id=randomUUID();
  db.prepare(`INSERT INTO document_versions (id,document_id,version,original_name,mime_type,size,storage_name,iv,auth_tag,checksum,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,documentId,version,file.originalname,file.mimetype,file.size,stored.storageName,stored.iv,stored.authTag,stored.checksum,req.user!.id);
  audit(db,req,"version_uploaded","document",documentId,{version,size:file.size,checksum:stored.checksum});res.status(201).json({id,version});
});

router.get("/documents/:id/download",(req:AuthRequest,res)=>{
  type VersionRow={original_name:string;mime_type:string;storage_name:string;iv:string;auth_tag:string};
  const documentId=routeParam(req,"id"),row=getDb().prepare(`SELECT v.original_name,v.mime_type,v.storage_name,v.iv,v.auth_tag FROM documents d JOIN document_versions v ON v.document_id=d.id WHERE d.id=? AND d.council_id=? ORDER BY v.version DESC LIMIT 1`).get(documentId,req.user!.councilId) as VersionRow|undefined;
  if(!row)throw new HttpError(404,"Dokument nicht gefunden.");
  audit(getDb(),req,"downloaded","document",documentId);
  const safeName=row.original_name.replace(/[\r\n"\\]/g,"_");
  res.type(row.mime_type).setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`).send(readEncrypted(row.storage_name,row.iv,row.auth_tag));
});

export default router;
