import { randomBytes } from "node:crypto";
import path from "node:path";

const isProduction = process.env.NODE_ENV === "production";

function encryptionKey(): Buffer {
  const configured = process.env.FILE_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) {
      throw new Error("FILE_ENCRYPTION_KEY muss Base64-kodiert genau 32 Byte enthalten.");
    }
    return key;
  }
  if (isProduction) throw new Error("FILE_ENCRYPTION_KEY fehlt.");
  return randomBytes(32);
}

const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "development-only-session-secret-change-me");
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET muss mindestens 32 Zeichen lang sein.");
}

export const config = {
  isProduction,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  databasePath: path.resolve(process.env.DATABASE_PATH || "data/br-manager.db"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "uploads"),
  sessionSecret,
  fileEncryptionKey: encryptionKey(),
  sessionTtlMs: 12 * 60 * 60 * 1000,
  bootstrapEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@betriebsrat.local").toLowerCase(),
  bootstrapPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || (isProduction ? "" : "Betriebsrat!2026"),
  bootstrapCouncil: process.env.BOOTSTRAP_COUNCIL_NAME || "Betriebsrat Musterwerk",
  seedDemoData: process.env.SEED_DEMO_DATA === "true",
  trustProxy: process.env.TRUST_PROXY === "true",
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : isProduction,
  maxUploadBytes: 25 * 1024 * 1024,
};
