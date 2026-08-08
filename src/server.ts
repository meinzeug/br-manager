import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, getDb } from "./database.js";

getDb();
const app=createApp();
const server=app.listen(config.port,config.host,()=>{
  console.log(`BR Manager läuft auf http://${config.host}:${config.port}`);
});

function shutdown(signal:string){
  console.log(`${signal} empfangen, fahre geordnet herunter.`);
  server.close(()=>{closeDb();process.exit(0);});
  setTimeout(()=>process.exit(1),10_000).unref();
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
