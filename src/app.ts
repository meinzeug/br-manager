import express, { Router } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authMe, authenticate, changePassword, disableTwoFactor, enableTwoFactor, login, logout, requireAuth, requireCsrf, setupTwoFactor } from "./auth.js";
import { config } from "./config.js";
import { getDb } from "./database.js";
import { errorHandler, notFound } from "./http.js";
import documents from "./routes/documents.js";
import meetings from "./routes/meetings.js";
import organization from "./routes/organization.js";
import work from "./routes/work.js";

const dirname=path.dirname(fileURLToPath(import.meta.url));

export function createApp(){
  const app=express();
  app.set("trust proxy",config.trustProxy ? 1 : false);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"]}},
    crossOriginEmbedderPolicy:false,
  }));
  app.use(express.json({limit:"1mb"}));
  app.use(express.urlencoded({extended:false,limit:"1mb"}));
  app.use(cookieParser());

  const api=Router();
  api.get("/health",(_req,res)=>{const row=getDb().prepare("SELECT 1 ok").get() as {ok:number};res.json({status:row.ok===1?"ok":"error",service:"br-manager",version:"1.0.0",time:new Date().toISOString()});});
  api.post("/auth/login",login);
  api.use(authenticate);
  api.get("/auth/me",authMe);
  api.use(requireAuth);
  api.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
  api.use(requireCsrf);
  api.post("/auth/logout",logout);
  api.post("/auth/change-password",changePassword);
  api.post("/auth/2fa/setup",setupTwoFactor);
  api.post("/auth/2fa/enable",enableTwoFactor);
  api.post("/auth/2fa/disable",disableTwoFactor);
  api.use(work,meetings,documents,organization);
  api.use(notFound);
  app.use("/api",api);

  const clientDir=path.resolve(dirname,"../client");
  app.use(express.static(clientDir,{maxAge:config.isProduction?"7d":0,index:false}));
  app.use((req,res,next)=>{
    if(req.method==="GET"&&req.accepts("html")){res.setHeader("Cache-Control","no-cache");res.sendFile(path.join(clientDir,"index.html"));return;}next();
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
