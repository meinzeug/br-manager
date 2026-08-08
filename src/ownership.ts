import type { SqliteDatabase } from "./database.js";
import { HttpError } from "./http.js";

type CouncilTable="users"|"cases"|"meetings"|"agreements"|"committees"|"decisions";

export function assertOwned(db:SqliteDatabase,councilId:string,table:CouncilTable,id:string|null|undefined,label="Verknüpfter Datensatz"):void{
  if(id&&!db.prepare(`SELECT id FROM ${table} WHERE id=? AND council_id=?`).get(id,councilId))throw new HttpError(400,`${label} gehört nicht zu diesem Gremium.`);
}
