import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "./config.js";
import { getDb } from "./database.js";
import { audit } from "./audit.js";
import { rolePermissions, type AuthRequest, type AuthUser, type Permission, type Role } from "./types.js";
import { openText, sealText } from "./files.js";
import { generateTotpSecret, verifyTotp } from "./totp.js";

const COOKIE_NAME = "br_session";
const attempts = new Map<string, { count: number; resetAt: number }>();

function tokenHash(token: string): string {
  return createHash("sha256").update(`${config.sessionSecret}:${token}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return next();
  const db = getDb();
  const row = db.prepare(`
    SELECT s.id AS session_id, s.csrf_token, s.expires_at,
           u.id, u.council_id, u.email, u.first_name, u.last_name, u.role, u.must_change_password, u.two_factor_enabled,
           c.name AS council_name
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN councils c ON c.id=u.council_id
    WHERE s.token_hash=? AND u.active=1
  `).get(tokenHash(token)) as Record<string, unknown> | undefined;
  if (!row || new Date(String(row.expires_at)).getTime() < Date.now()) {
    if (row) db.prepare("DELETE FROM sessions WHERE id=?").run(row.session_id);
    return next();
  }
  req.sessionId = String(row.session_id);
  req.csrfToken = String(row.csrf_token);
  req.user = {
    id: String(row.id), councilId: String(row.council_id), councilName: String(row.council_name),
    email: String(row.email), firstName: String(row.first_name), lastName: String(row.last_name),
    role: String(row.role) as Role, mustChangePassword: Boolean(row.must_change_password), twoFactorEnabled:Boolean(row.two_factor_enabled),
  };
  db.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").run(req.sessionId);
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Anmeldung erforderlich." });
    return;
  }
  next();
}

export function requireCsrf(req: AuthRequest, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.csrfToken || !safeEqual(req.csrfToken, String(req.get("x-csrf-token") || ""))) {
    res.status(403).json({ error: "Ungültiger CSRF-Token. Bitte Seite neu laden." });
    return;
  }
  next();
}

export function permit(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !rolePermissions[req.user.role].includes(permission)) {
      res.status(403).json({ error: "Für diese Aktion fehlt die Berechtigung." });
      return;
    }
    next();
  };
}

export function authMe(req: AuthRequest, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }
  res.json({ user: req.user, permissions: rolePermissions[req.user.role], csrfToken: req.csrfToken });
}

export function login(req: Request, res: Response): void {
  const parsed = z.object({ email: z.email().max(254), password: z.string().min(1).max(200),totpCode:z.string().max(20).optional().default("") }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "E-Mail-Adresse und Passwort sind erforderlich." });
    return;
  }
  const key = `${req.ip}:${parsed.data.email.toLowerCase()}`;
  const entry = attempts.get(key);
  if (entry && entry.resetAt > Date.now() && entry.count >= 8) {
    res.status(429).json({ error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." });
    return;
  }

  const db = getDb();
  const row = db.prepare(`SELECT u.*, c.name AS council_name FROM users u JOIN councils c ON c.id=u.council_id
                          WHERE u.email=? COLLATE NOCASE AND u.active=1 LIMIT 1`).get(parsed.data.email) as Record<string, unknown> | undefined;
  if (!row || !bcrypt.compareSync(parsed.data.password, String(row.password_hash))) {
    attempts.set(key, { count: (entry?.count ?? 0) + 1, resetAt: Date.now() + 15 * 60_000 });
    res.status(401).json({ error: "E-Mail-Adresse oder Passwort ist falsch." });
    return;
  }
  if(row.two_factor_enabled){
    let valid=false;
    try{valid=Boolean(row.two_factor_secret)&&verifyTotp(openText(String(row.two_factor_secret)),parsed.data.totpCode);}catch{valid=false;}
    if(!valid){
      attempts.set(key,{count:(entry?.count??0)+1,resetAt:Date.now()+15*60_000});
      res.status(401).json({error:"Zwei-Faktor-Code erforderlich oder ungültig.",twoFactorRequired:true});
      return;
    }
  }
  attempts.delete(key);
  const rawToken = randomBytes(32).toString("base64url");
  const csrf = randomBytes(24).toString("base64url");
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();
  db.transaction(() => {
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
    db.prepare(`INSERT INTO sessions (id,token_hash,user_id,csrf_token,ip_address,user_agent,expires_at)
                VALUES (?,?,?,?,?,?,?)`).run(sessionId, tokenHash(rawToken), row.id, csrf, req.ip || "", req.get("user-agent") || "", expiresAt);
    db.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  })();
  res.cookie(COOKIE_NAME, rawToken, {
    httpOnly: true, sameSite: "strict", secure: config.cookieSecure, maxAge: config.sessionTtlMs, path: "/",
  });
  const user: AuthUser = {
    id: String(row.id), councilId: String(row.council_id), councilName: String(row.council_name),
    email: String(row.email), firstName: String(row.first_name), lastName: String(row.last_name),
    role: String(row.role) as Role, mustChangePassword: Boolean(row.must_change_password), twoFactorEnabled:Boolean(row.two_factor_enabled),
  };
  const auditReq = req as AuthRequest;
  auditReq.user = user;
  audit(db, auditReq, "login", "session", sessionId);
  res.json({ user, permissions: rolePermissions[user.role], csrfToken: csrf });
}

export function logout(req: AuthRequest, res: Response): void {
  if (req.sessionId) {
    audit(getDb(), req, "logout", "session", req.sessionId);
    getDb().prepare("DELETE FROM sessions WHERE id=?").run(req.sessionId);
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.status(204).end();
}

export function changePassword(req: AuthRequest, res: Response): void {
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(200) }).safeParse(req.body);
  if (!parsed.success || !req.user) {
    res.status(400).json({ error: "Das neue Passwort muss mindestens 12 Zeichen lang sein." });
    return;
  }
  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(req.user.id) as { password_hash: string };
  if (!bcrypt.compareSync(parsed.data.currentPassword, row.password_hash)) {
    res.status(400).json({ error: "Das aktuelle Passwort ist falsch." });
    return;
  }
  db.prepare("UPDATE users SET password_hash=?, must_change_password=0, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(bcrypt.hashSync(parsed.data.newPassword, 12), req.user.id);
  db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").run(req.user.id, req.sessionId);
  audit(db, req, "password_changed", "user", req.user.id);
  res.status(204).end();
}

export function setupTwoFactor(req:AuthRequest,res:Response):void{
  if(!req.user)return;
  const secret=generateTotpSecret(),db=getDb();
  const existing=db.prepare("SELECT two_factor_enabled FROM users WHERE id=?").get(req.user.id) as {two_factor_enabled:number};
  if(existing.two_factor_enabled){res.status(409).json({error:"Zwei-Faktor-Anmeldung ist bereits aktiv. Zum Zurücksetzen zuerst mit dem Passwort deaktivieren."});return;}
  db.prepare("UPDATE users SET two_factor_secret=?,two_factor_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sealText(secret),req.user.id);
  audit(db,req,"two_factor_setup_started","user",req.user.id);
  const label=encodeURIComponent(`${req.user.councilName}:${req.user.email}`),issuer=encodeURIComponent("BR Manager");
  res.json({secret,otpauthUri:`otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`});
}

export function enableTwoFactor(req:AuthRequest,res:Response):void{
  const parsed=z.object({code:z.string().length(6)}).safeParse(req.body);
  if(!parsed.success||!req.user){res.status(400).json({error:"Bitte einen sechsstelligen Code eingeben."});return;}
  const db=getDb(),row=db.prepare("SELECT two_factor_secret FROM users WHERE id=?").get(req.user.id) as {two_factor_secret:string|null};
  if(!row.two_factor_secret){res.status(400).json({error:"Bitte Zwei-Faktor-Anmeldung zuerst einrichten."});return;}
  let valid=false;try{valid=verifyTotp(openText(row.two_factor_secret),parsed.data.code);}catch{valid=false;}
  if(!valid){res.status(400).json({error:"Der Code ist ungültig oder abgelaufen."});return;}
  db.prepare("UPDATE users SET two_factor_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.user.id);
  audit(db,req,"two_factor_enabled","user",req.user.id);res.status(204).end();
}

export function disableTwoFactor(req:AuthRequest,res:Response):void{
  const parsed=z.object({password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!parsed.success||!req.user){res.status(400).json({error:"Passwort erforderlich."});return;}
  const db=getDb(),row=db.prepare("SELECT password_hash FROM users WHERE id=?").get(req.user.id) as {password_hash:string};
  if(!bcrypt.compareSync(parsed.data.password,row.password_hash)){res.status(400).json({error:"Das Passwort ist falsch."});return;}
  db.prepare("UPDATE users SET two_factor_enabled=0,two_factor_secret=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.user.id);
  audit(db,req,"two_factor_disabled","user",req.user.id);res.status(204).end();
}
