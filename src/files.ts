import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export interface StoredFile {
  storageName: string;
  iv: string;
  authTag: string;
  checksum: string;
}

export function sealText(value:string):string{
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",config.fileEncryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}

export function openText(value:string):string{
  const [iv,tag,encrypted]=value.split(".");
  if(!iv||!tag||!encrypted)throw new Error("Ungültiges Geheimnis.");
  const decipher=createDecipheriv("aes-256-gcm",config.fileEncryptionKey,Buffer.from(iv,"base64url"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted,"base64url")),decipher.final()]).toString("utf8");
}

export function storeEncrypted(content: Buffer): StoredFile {
  mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.fileEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  const storageName = `${randomUUID()}.enc`;
  writeFileSync(path.join(config.uploadDir, storageName), encrypted, { mode: 0o600 });
  return {
    storageName,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    checksum: createHash("sha256").update(content).digest("hex"),
  };
}

export function readEncrypted(storageName: string, iv: string, authTag: string): Buffer {
  if (!/^[a-f0-9-]+\.enc$/i.test(storageName)) throw new Error("Ungültiger Dateiname.");
  const encrypted = readFileSync(path.join(config.uploadDir, storageName));
  const decipher = createDecipheriv("aes-256-gcm", config.fileEncryptionKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
