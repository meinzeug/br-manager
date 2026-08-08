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
    expect((await agent.get(`/api/cases/${caseResponse.body.id}`)).body.item.title).toBe("Versetzung eines Beschäftigten");
    expect((await agent.patch(`/api/cases/${caseResponse.body.id}`).set("x-csrf-token",csrf).send({priority:"kritisch"})).status).toBe(204);

    const start=new Date(Date.now()+86400000).toISOString();
    const end=new Date(Date.now()+90000000).toISOString();
    const meeting=await agent.post("/api/meetings").set("x-csrf-token",csrf).send({title:"Ordentliche Sitzung",startsAt:start,endsAt:end,status:"geplant"});
    expect(meeting.status).toBe(201);
    const meetingId=meeting.body.id as string;

    const agenda=await agent.post(`/api/meetings/${meetingId}/agenda`).set("x-csrf-token",csrf).send({title:"Versetzung beraten",kind:"beschluss",caseId:caseResponse.body.id});
    expect(agenda.status).toBe(201);
    expect((await agent.patch(`/api/meetings/${meetingId}/agenda/${agenda.body.id}`).set("x-csrf-token",csrf).send({durationMinutes:30,isConfidential:true})).status).toBe(204);

    const members=await agent.get("/api/members");
    const userId=members.body.items[0].id as string;
    expect((await agent.patch(`/api/meetings/${meetingId}/attendance/${userId}`).set("x-csrf-token",csrf).send({attendance:"anwesend"})).status).toBe(204);

    const decision=await agent.post(`/api/meetings/${meetingId}/decisions`).set("x-csrf-token",csrf).send({
      title:"Zustimmung zur Versetzung",resolutionText:"Der Betriebsrat stimmt der Maßnahme zu.",agendaItemId:agenda.body.id,
      caseId:caseResponse.body.id,voteYes:1,voteNo:0,voteAbstain:0,eligibleVoters:1,
    });
    expect(decision.status).toBe(201);
    expect(decision.body).toMatchObject({result:"angenommen",quorumMet:true});
    expect((await agent.get(`/api/decisions/${decision.body.id}`)).body.item.reference).toBe(decision.body.reference);
    const detail=await agent.get(`/api/meetings/${meetingId}`);
    expect(detail.body.agenda[0]).toMatchObject({duration_minutes:30,is_confidential:1});
    expect(detail.body.decisions[0].id).toBe(decision.body.id);

    const search=await agent.get("/api/search?q=Versetzung");
    expect(search.body.items).toEqual(expect.arrayContaining([expect.objectContaining({url:`/vorgaenge?open=${caseResponse.body.id}`})]));
    const notifications=await agent.get("/api/notifications");
    expect(notifications.body.items).toEqual(expect.arrayContaining([expect.objectContaining({link:`/beschluesse?open=${decision.body.id}`})]));
  });

  it("öffnet und bearbeitet Aufgaben, Anfragen und Vereinbarungen",async()=>{
    const member=(await agent.get("/api/members")).body.items[0];
    const task=await agent.post("/api/tasks").set("x-csrf-token",csrf).send({title:"Unterlagen prüfen",description:"Alle Anlagen prüfen",assignedTo:member.id});
    expect(task.status).toBe(201);
    expect((await agent.patch(`/api/tasks/${task.body.id}`).set("x-csrf-token",csrf).send({status:"in_arbeit",priority:"hoch"})).status).toBe(204);
    expect((await agent.get(`/api/tasks/${task.body.id}`)).body.item).toMatchObject({status:"in_arbeit",priority:"hoch"});

    const inquiry=await agent.post("/api/inquiries").set("x-csrf-token",csrf).send({subject:"Arbeitszeit klären",requesterName:"Erika Beispiel",description:"Bitte um vertrauliche Beratung",consentRecorded:true});
    expect(inquiry.status).toBe(201);
    expect((await agent.patch(`/api/inquiries/${inquiry.body.id}`).set("x-csrf-token",csrf).send({status:"in_bearbeitung",outcome:"Termin vereinbart"})).status).toBe(204);
    expect((await agent.get(`/api/inquiries/${inquiry.body.id}`)).body.item.outcome).toBe("Termin vereinbart");

    const agreement=await agent.post("/api/agreements").set("x-csrf-token",csrf).send({title:"Mobile Arbeit",category:"arbeitszeit",summary:"Regelt hybride Arbeit"});
    expect(agreement.status).toBe(201);
    expect((await agent.patch(`/api/agreements/${agreement.body.id}`).set("x-csrf-token",csrf).send({status:"verhandlung",afterEffect:true})).status).toBe(204);
    expect((await agent.get(`/api/agreements/${agreement.body.id}`)).body.item).toMatchObject({status:"verhandlung",after_effect:1});
  });

  it("verknüpft Module beidseitig und erzeugt Folgeaufgaben aus dem Kontext",async()=>{
    const member=(await agent.get("/api/members")).body.items[0];
    const caseResponse=await agent.post("/api/cases").set("x-csrf-token",csrf).send({title:"KI-Richtlinie einführen",category:"technische_einrichtung"});
    const agreement=await agent.post("/api/agreements").set("x-csrf-token",csrf).send({title:"Rahmenvereinbarung KI",category:"it_ki"});
    const connection=await agent.post("/api/connections").set("x-csrf-token",csrf).send({sourceType:"case",sourceId:caseResponse.body.id,targetType:"agreement",targetId:agreement.body.id,relation:"Regelungsgrundlage"});
    expect(connection.status).toBe(201);

    const fromCase=await agent.get(`/api/connections/case/${caseResponse.body.id}`),fromAgreement=await agent.get(`/api/connections/agreement/${agreement.body.id}`);
    expect(fromCase.body.items[0]).toMatchObject({type:"agreement",id:agreement.body.id,relation:"Regelungsgrundlage",url:`/vereinbarungen?open=${agreement.body.id}`});
    expect(fromAgreement.body.items[0]).toMatchObject({type:"case",id:caseResponse.body.id,url:`/vorgaenge?open=${caseResponse.body.id}`});
    expect((await agent.get("/api/connections/options/agreement?q=Rahmenvereinbarung")).body.items[0].id).toBe(agreement.body.id);

    const followUp=await agent.post(`/api/connections/agreement/${agreement.body.id}/tasks`).set("x-csrf-token",csrf).send({title:"KI-Regelungen vergleichen",description:"Vorgang und Vereinbarung abgleichen",assignedTo:member.id,priority:"hoch"});
    expect(followUp.status).toBe(201);
    expect((await agent.get(`/api/tasks/${followUp.body.id}`)).body.item).toMatchObject({title:"KI-Regelungen vergleichen",priority:"hoch"});
    expect((await agent.get(`/api/connections/task/${followUp.body.id}`)).body.items[0]).toMatchObject({type:"agreement",id:agreement.body.id,relation:"Folgeaufgabe"});

    expect((await agent.delete(`/api/connections/${connection.body.id}`).set("x-csrf-token",csrf)).status).toBe(204);
    expect((await agent.get(`/api/connections/case/${caseResponse.body.id}`)).body.items).toHaveLength(0);
    const foreignLink=await agent.post("/api/tasks").set("x-csrf-token",csrf).send({title:"Ungültige Zuordnung",caseId:"00000000-0000-4000-8000-000000000000"});
    expect(foreignLink.status).toBe(400);
  });

  it("verschlüsselt hochgeladene Dokumente transparent",async()=>{
    const content=Buffer.from("Vertrauliche Sitzungsunterlage");
    const upload=await agent.post("/api/documents").set("x-csrf-token",csrf).field("title","Testunterlage").field("category","sitzungsunterlage").attach("file",content,{filename:"unterlage.txt",contentType:"text/plain"});
    expect(upload.status).toBe(201);
    expect((await agent.get(`/api/documents/${upload.body.id}`)).body.related.versions).toHaveLength(1);
    const linkedCase=(await agent.get("/api/cases")).body.items[0],linkedMeeting=(await agent.get("/api/meetings")).body.items[0],linkedAgreement=(await agent.get("/api/agreements")).body.items[0];
    expect((await agent.patch(`/api/documents/${upload.body.id}`).set("x-csrf-token",csrf).send({title:"Aktualisierte Testunterlage",folder:"Sitzungen",caseId:linkedCase.id,meetingId:linkedMeeting.id,agreementId:linkedAgreement.id})).status).toBe(204);
    const linkedDetail=await agent.get(`/api/documents/${upload.body.id}`);
    expect(linkedDetail.body.related).toMatchObject({cases:[{id:linkedCase.id}],meetings:[{id:linkedMeeting.id}],agreements:[{id:linkedAgreement.id}]});
    expect((await agent.patch(`/api/documents/${upload.body.id}`).set("x-csrf-token",csrf).send({folder:"Beschlussunterlagen"})).status).toBe(204);
    expect((await agent.get(`/api/documents/${upload.body.id}`)).body.related).toMatchObject({cases:[{id:linkedCase.id}],meetings:[{id:linkedMeeting.id}],agreements:[{id:linkedAgreement.id}]});
    const nextContent=Buffer.from("Aktualisierte vertrauliche Sitzungsunterlage");
    const version=await agent.post(`/api/documents/${upload.body.id}/versions`).set("x-csrf-token",csrf).attach("file",nextContent,{filename:"unterlage-v2.txt",contentType:"text/plain"});
    expect(version.body.version).toBe(2);
    const download=await agent.get(`/api/documents/${upload.body.id}/download`).buffer(true);
    expect(download.status).toBe(200);
    expect(download.text).toBe(nextContent.toString());
  });

  it("pflegt Ausschüsse, Mitgliedschaften und Schulungen über Detailmasken",async()=>{
    const member=(await agent.get("/api/members")).body.items[0];
    expect((await agent.get(`/api/members/${member.id}`)).body.item.display_name).toContain(member.first_name);
    expect((await agent.patch(`/api/members/${member.id}`).set("x-csrf-token",csrf).send({position:"Betriebsratsvorsitz",temporaryPassword:""})).status).toBe(204);
    expect((await agent.get(`/api/members/${member.id}`)).body.item.position).toBe("Betriebsratsvorsitz");

    const committee=await agent.post("/api/committees").set("x-csrf-token",csrf).send({name:"Digitalausschuss",kind:"ausschuss",description:"Begleitet digitale Vorhaben"});
    expect(committee.status).toBe(201);
    expect((await agent.put(`/api/committees/${committee.body.id}/members`).set("x-csrf-token",csrf).send({members:[{userId:member.id,function:"Vorsitz"}]})).status).toBe(204);
    expect((await agent.patch(`/api/committees/${committee.body.id}`).set("x-csrf-token",csrf).send({description:"Digitale Vorhaben und KI"})).status).toBe(204);
    const committeeDetail=await agent.get(`/api/committees/${committee.body.id}`);
    expect(committeeDetail.body.related.members[0]).toMatchObject({user_id:member.id,function:"Vorsitz"});

    const startsAt=new Date(Date.now()+7*86400000).toISOString(),endsAt=new Date(Date.now()+8*86400000).toISOString();
    const decision=(await agent.get("/api/decisions")).body.items[0];
    const training=await agent.post("/api/trainings").set("x-csrf-token",csrf).send({userId:member.id,title:"Betriebsverfassungsrecht kompakt",provider:"Bildungswerk",startsAt,endsAt,costEuro:799,decisionId:decision.id});
    expect(training.status).toBe(201);
    expect((await agent.patch(`/api/trainings/${training.body.id}`).set("x-csrf-token",csrf).send({status:"gebucht",costEuro:849})).status).toBe(204);
    const trainingDetail=await agent.get(`/api/trainings/${training.body.id}`);
    expect(trainingDetail.body.item).toMatchObject({status:"gebucht",cost_cents:84900});
    expect(trainingDetail.body.related.decisions[0].id).toBe(decision.id);
  });

  it("setzt Rollenrechte serverseitig durch",async()=>{
    const create=await agent.post("/api/members").set("x-csrf-token",csrf).send({email:"leser@test.local",firstName:"Lena",lastName:"Leser",role:"lesezugriff",temporaryPassword:"Read-Only-Password!"});
    expect(create.status).toBe(201);
    const reader=request.agent((await import("./app.js")).createApp());
    const login=await reader.post("/api/auth/login").send({email:"leser@test.local",password:"Read-Only-Password!"});
    expect(login.status).toBe(200);
    const forbidden=await reader.post("/api/tasks").set("x-csrf-token",login.body.csrfToken).send({title:"Darf nicht angelegt werden"});
    expect(forbidden.status).toBe(403);
    expect((await reader.post("/api/connections").set("x-csrf-token",login.body.csrfToken).send({})).status).toBe(403);
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
