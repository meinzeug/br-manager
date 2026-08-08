import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request, { type TestAgent } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDir=mkdtempSync(path.join(tmpdir(),"br-manager-test-"));
process.env.NODE_ENV="test";
process.env.DATABASE_PATH=path.join(testDir,"test.db");
process.env.UPLOAD_DIR=path.join(testDir,"uploads");
process.env.SESSION_SECRET="test-session-secret-with-at-least-32-characters";
process.env.FILE_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");
process.env.BOOTSTRAP_ADMIN_EMAIL="admin@test.local";
process.env.BOOTSTRAP_ADMIN_PASSWORD="Secure-Test-Password!2026";

let agent:TestAgent,csrf="",closeDb:()=>void;

beforeAll(async()=>{
  const [{createApp},database]=await Promise.all([import("./app.js"),import("./database.js")]);
  closeDb=database.closeDb;
  agent=request.agent(createApp());
  const login=await agent.post("/api/auth/login").send({email:"admin@test.local",password:"Secure-Test-Password!2026"});
  expect(login.status).toBe(200);
  csrf=login.body.csrfToken as string;
});
afterAll(()=>{closeDb();rmSync(testDir,{recursive:true,force:true});});

describe("BR Manager API",()=>{
  it("meldet den Dienstzustand und den Benutzer",async()=>{
    expect((await agent.get("/api/health")).status).toBe(200);
    const me=await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe("admin");
  });

  it("erzwingt CSRF für Schreibzugriffe",async()=>{
    const response=await agent.post("/api/cases").send({title:"Ohne Token",category:"sonstiges"});
    expect(response.status).toBe(403);
  });

  it("bildet Vorgang, Sitzung, Tagesordnung und gültigen Beschluss ab",async()=>{
    const caseResponse=await agent.post("/api/cases").set("x-csrf-token",csrf).send({
      title:"Versetzung eines Beschäftigten",category:"personelle_massnahme",legalBasis:"§ 99 BetrVG",priority:"hoch",
    });
    expect(caseResponse.status).toBe(201);
    expect(caseResponse.body.reference).toMatch(/^V-/);

    const start=new Date(Date.now()+86400000).toISOString();
    const end=new Date(Date.now()+90000000).toISOString();
    const meeting=await agent.post("/api/meetings").set("x-csrf-token",csrf).send({title:"Ordentliche Sitzung",startsAt:start,endsAt:end,status:"geplant"});
    expect(meeting.status).toBe(201);
    const meetingId=meeting.body.id as string;

    const agenda=await agent.post(`/api/meetings/${meetingId}/agenda`).set("x-csrf-token",csrf).send({title:"Versetzung beraten",kind:"beschluss",caseId:caseResponse.body.id});
    expect(agenda.status).toBe(201);

    const members=await agent.get("/api/members");
    const userId=members.body.items[0].id as string;
    expect((await agent.patch(`/api/meetings/${meetingId}/attendance/${userId}`).set("x-csrf-token",csrf).send({attendance:"anwesend"})).status).toBe(204);

    const decision=await agent.post(`/api/meetings/${meetingId}/decisions`).set("x-csrf-token",csrf).send({
      title:"Zustimmung zur Versetzung",resolutionText:"Der Betriebsrat stimmt der Maßnahme zu.",agendaItemId:agenda.body.id,
      caseId:caseResponse.body.id,voteYes:1,voteNo:0,voteAbstain:0,eligibleVoters:1,
    });
    expect(decision.status).toBe(201);
    expect(decision.body).toMatchObject({result:"angenommen",quorumMet:true});
  });

  it("verschlüsselt hochgeladene Dokumente transparent",async()=>{
    const content=Buffer.from("Vertrauliche Sitzungsunterlage");
    const upload=await agent.post("/api/documents").set("x-csrf-token",csrf).field("title","Testunterlage").field("category","sitzungsunterlage").attach("file",content,{filename:"unterlage.txt",contentType:"text/plain"});
    expect(upload.status).toBe(201);
    const download=await agent.get(`/api/documents/${upload.body.id}/download`).buffer(true);
    expect(download.status).toBe(200);
    expect(download.text).toBe(content.toString());
  });

  it("setzt Rollenrechte serverseitig durch",async()=>{
    const create=await agent.post("/api/members").set("x-csrf-token",csrf).send({email:"leser@test.local",firstName:"Lena",lastName:"Leser",role:"lesezugriff",temporaryPassword:"Read-Only-Password!"});
    expect(create.status).toBe(201);
    const reader=request.agent((await import("./app.js")).createApp());
    const login=await reader.post("/api/auth/login").send({email:"leser@test.local",password:"Read-Only-Password!"});
    expect(login.status).toBe(200);
    const forbidden=await reader.post("/api/tasks").set("x-csrf-token",login.body.csrfToken).send({title:"Darf nicht angelegt werden"});
    expect(forbidden.status).toBe(403);
  });

  it("schützt Konten optional mit standardkonformer TOTP-2FA",async()=>{
    await agent.post("/api/members").set("x-csrf-token",csrf).send({email:"zwei-faktor@test.local",firstName:"Toni",lastName:"Totp",role:"mitglied",temporaryPassword:"Second-Factor-Password!"});
    const twoFactorAgent=request.agent((await import("./app.js")).createApp());
    const login=await twoFactorAgent.post("/api/auth/login").send({email:"zwei-faktor@test.local",password:"Second-Factor-Password!"});
    const userCsrf=login.body.csrfToken as string;
    const setup=await twoFactorAgent.post("/api/auth/2fa/setup").set("x-csrf-token",userCsrf).send({});
    const {totp}=await import("./totp.js");
    expect((await twoFactorAgent.post("/api/auth/2fa/enable").set("x-csrf-token",userCsrf).send({code:totp(setup.body.secret)})).status).toBe(204);
    await twoFactorAgent.post("/api/auth/logout").set("x-csrf-token",userCsrf);
    expect((await twoFactorAgent.post("/api/auth/login").send({email:"zwei-faktor@test.local",password:"Second-Factor-Password!"})).status).toBe(401);
    expect((await twoFactorAgent.post("/api/auth/login").send({email:"zwei-faktor@test.local",password:"Second-Factor-Password!",totpCode:totp(setup.body.secret)})).status).toBe(200);
  });
});
