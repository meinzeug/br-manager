import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";

export function notify(db:SqliteDatabase,councilId:string,userId:string|null,type:string,title:string,body:string,link:string):void{
  db.prepare(`INSERT INTO notifications (id,council_id,user_id,type,title,body,link) VALUES (?,?,?,?,?,?,?)`).run(randomUUID(),councilId,userId,type,title,body,link);
}
