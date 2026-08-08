import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export type SqliteDatabase = Database.Database;

let singleton: SqliteDatabase | undefined;

export function getDb(): SqliteDatabase {
  if (singleton) return singleton;
  mkdirSync(path.dirname(config.databasePath), { recursive: true, mode: 0o700 });
  singleton = new Database(config.databasePath);
  singleton.pragma("journal_mode = WAL");
  singleton.pragma("foreign_keys = ON");
  singleton.pragma("busy_timeout = 5000");
  migrate(singleton);
  bootstrap(singleton);
  return singleton;
}

export function closeDb(): void {
  singleton?.close();
  singleton = undefined;
}

function migrate(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS councils (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      term_start TEXT,
      term_end TEXT,
      meeting_notice_days INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','vorsitz','sekretariat','mitglied','ersatzmitglied','lesezugriff')),
      position TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      two_factor_secret TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      substitute_rank INTEGER,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, email)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS committees (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'ausschuss',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS committee_members (
      committee_id TEXT NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      function TEXT NOT NULL DEFAULT 'Mitglied',
      PRIMARY KEY(committee_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      legal_basis TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'neu',
      priority TEXT NOT NULL DEFAULT 'normal',
      received_at TEXT,
      due_at TEXT,
      responsible_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      confidentiality TEXT NOT NULL DEFAULT 'gremium',
      procedure_template_id TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, reference)
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      committee_id TEXT REFERENCES committees(id) ON DELETE SET NULL,
      sequence_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'ordentlich',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      video_link TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'entwurf',
      invitation_sent_at TEXT,
      minutes TEXT NOT NULL DEFAULT '',
      minutes_status TEXT NOT NULL DEFAULT 'entwurf',
      chair_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      secretary_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, sequence_no)
    );

    CREATE TABLE IF NOT EXISTS meeting_attendees (
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitation_status TEXT NOT NULL DEFAULT 'eingeladen',
      attendance TEXT NOT NULL DEFAULT 'offen',
      attendance_mode TEXT NOT NULL DEFAULT 'praesenz',
      prevented_reason TEXT NOT NULL DEFAULT '',
      substitute_for_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      signed_at TEXT,
      PRIMARY KEY(meeting_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS agenda_items (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'beratung',
      case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 15,
      is_confidential INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(meeting_id, position)
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      agenda_item_id TEXT REFERENCES agenda_items(id) ON DELETE SET NULL,
      case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
      reference TEXT NOT NULL,
      title TEXT NOT NULL,
      resolution_text TEXT NOT NULL,
      vote_yes INTEGER NOT NULL DEFAULT 0,
      vote_no INTEGER NOT NULL DEFAULT 0,
      vote_abstain INTEGER NOT NULL DEFAULT 0,
      eligible_voters INTEGER NOT NULL DEFAULT 0,
      quorum_met INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL DEFAULT 'offen',
      voting_method TEXT NOT NULL DEFAULT 'offen',
      decided_at TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, reference)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'offen',
      priority TEXT NOT NULL DEFAULT 'normal',
      due_at TEXT,
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
      meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
      workflow_step TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      folder TEXT NOT NULL DEFAULT 'Allgemein',
      category TEXT NOT NULL DEFAULT 'sonstiges',
      confidentiality TEXT NOT NULL DEFAULT 'gremium',
      case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
      meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
      agreement_id TEXT,
      retention_until TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      checksum TEXT NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, version)
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      subject TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_contact TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT 'persoenlich',
      category TEXT NOT NULL DEFAULT 'beratung',
      description TEXT NOT NULL,
      consent_recorded INTEGER NOT NULL DEFAULT 0,
      confidentiality TEXT NOT NULL DEFAULT 'vertraulich',
      status TEXT NOT NULL DEFAULT 'neu',
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      due_at TEXT,
      outcome TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, reference)
    );

    CREATE TABLE IF NOT EXISTS agreements (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'sonstiges',
      status TEXT NOT NULL DEFAULT 'entwurf',
      valid_from TEXT,
      valid_until TEXT,
      notice_period TEXT NOT NULL DEFAULT '',
      after_effect INTEGER NOT NULL DEFAULT 0,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      summary TEXT NOT NULL DEFAULT '',
      review_at TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, reference)
    );

    CREATE TABLE IF NOT EXISTS trainings (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'geplant',
      cost_cents INTEGER NOT NULL DEFAULT 0,
      decision_id TEXT REFERENCES decisions(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entity_connections (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('case','task','inquiry','agreement','decision','document','meeting','training','member','committee')),
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('case','task','inquiry','agreement','decision','document','meeting','training','member','committee')),
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'Thematischer Zusammenhang',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, source_type, source_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS entity_legal_links (
      id TEXT PRIMARY KEY,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('case','task','inquiry','agreement','decision','document','meeting','training','member','committee')),
      entity_id TEXT NOT NULL,
      provision_id TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(council_id, entity_type, entity_id, provision_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      council_id TEXT REFERENCES councils(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_cases_council_status ON cases(council_id, status);
    CREATE INDEX IF NOT EXISTS idx_cases_due ON cases(council_id, due_at);
    CREATE INDEX IF NOT EXISTS idx_meetings_start ON meetings(council_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(council_id, assigned_to, status);
    CREATE INDEX IF NOT EXISTS idx_documents_council ON documents(council_id, category);
    CREATE INDEX IF NOT EXISTS idx_connections_source ON entity_connections(council_id, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_connections_target ON entity_connections(council_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_legal_links_entity ON entity_legal_links(council_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_council_date ON audit_logs(council_id, created_at DESC);
  `);
  ensureColumn(db,"users","two_factor_secret","TEXT");
  ensureColumn(db,"users","two_factor_enabled","INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db,"cases","procedure_template_id","TEXT");
  ensureColumn(db,"tasks","workflow_step","TEXT");
}

function ensureColumn(db:SqliteDatabase,table:string,column:string,declaration:string):void{
  const columns=db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];
  if(!columns.some(item=>item.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
}

function bootstrap(db: SqliteDatabase): void {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (existing.count > 0) return;
  if (!config.bootstrapPassword || config.bootstrapPassword.length < 12) {
    throw new Error("Für die Ersteinrichtung ist BOOTSTRAP_ADMIN_PASSWORD mit mindestens 12 Zeichen erforderlich.");
  }

  const councilId = randomUUID();
  const userId = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(config.bootstrapPassword, 12);

  db.transaction(() => {
    db.prepare("INSERT INTO councils (id, name, company_name, term_start, term_end) VALUES (?, ?, ?, ?, ?)")
      .run(councilId, config.bootstrapCouncil, "Musterwerk GmbH", now.slice(0, 10), `${new Date().getUTCFullYear() + 4}-05-31`);
    db.prepare(`INSERT INTO users (id, council_id, email, password_hash, first_name, last_name, role, position, must_change_password)
                VALUES (?, ?, ?, ?, ?, ?, 'admin', 'Vorsitz', 1)`)
      .run(userId, councilId, config.bootstrapEmail, passwordHash, "Admin", "Betriebsrat");
    const mainCommittee = randomUUID();
    db.prepare("INSERT INTO committees (id, council_id, name, kind, description) VALUES (?, ?, ?, 'gremium', ?)")
      .run(mainCommittee, councilId, "Betriebsrat", "Gesamtgremium");
    db.prepare("INSERT INTO committee_members (committee_id, user_id, function) VALUES (?, ?, 'Vorsitz')")
      .run(mainCommittee, userId);
    db.prepare(`INSERT INTO audit_logs (id, council_id, user_id, action, entity_type, entity_id, metadata)
                VALUES (?, ?, ?, 'bootstrap', 'council', ?, ?)`)
      .run(randomUUID(), councilId, userId, councilId, JSON.stringify({ email: config.bootstrapEmail }));
  })();

  if (config.seedDemoData) seedDemo(db, councilId, userId);
}

function seedDemo(db: SqliteDatabase, councilId: string, userId: string): void {
  const today = new Date();
  const isoDay = (offset: number) => new Date(today.getTime() + offset * 86400000).toISOString();
  const caseId = randomUUID();
  const meetingId = randomUUID();
  const taskId = randomUUID();
  const inquiryId = randomUUID();
  const agreementId = randomUUID();
  const committee = db.prepare("SELECT id FROM committees WHERE council_id = ? LIMIT 1").get(councilId) as { id: string };
  db.transaction(() => {
    db.prepare(`INSERT INTO cases (id,council_id,reference,title,category,legal_basis,description,status,priority,received_at,due_at,responsible_id,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(caseId, councilId, "V-2026-001", "Einführung neuer Zeiterfassung", "technische-einrichtung", "§ 87 Abs. 1 Nr. 6 BetrVG", "Prüfung der Leistungs- und Verhaltenskontrolle sowie Datenschutzfolgen.", "in_pruefung", "hoch", isoDay(-2), isoDay(7), userId, userId);
    db.prepare(`INSERT INTO meetings (id,council_id,committee_id,sequence_no,title,starts_at,ends_at,location,status,chair_id,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(meetingId, councilId, committee.id, 1, "Ordentliche Betriebsratssitzung", isoDay(3), isoDay(3.08), "BR-Sitzungsraum", "geplant", userId, userId);
    db.prepare(`INSERT INTO agenda_items (id,meeting_id,position,title,description,kind,case_id,duration_minutes)
      VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), meetingId, 1, "Eröffnung und Beschlussfähigkeit", "Feststellung der ordnungsgemäßen Ladung.", "formal", null, 10);
    db.prepare(`INSERT INTO agenda_items (id,meeting_id,position,title,description,kind,case_id,duration_minutes)
      VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), meetingId, 2, "Neue Zeiterfassung", "Beratung und Beschluss zum weiteren Vorgehen.", "beschluss", caseId, 30);
    db.prepare(`INSERT INTO tasks (id,council_id,title,description,status,priority,due_at,assigned_to,case_id,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(taskId, councilId, "Unterlagen zur Zeiterfassung prüfen", "Verfahrensverzeichnis und Berechtigungskonzept abgleichen.", "in_arbeit", "hoch", isoDay(5), userId, caseId, userId);
    db.prepare(`INSERT INTO inquiries (id,council_id,reference,subject,requester_name,channel,category,description,consent_recorded,status,assigned_to,due_at,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(inquiryId, councilId, "A-2026-001", "Beratung zu Schichtplanänderung", "Vertrauliche Anfrage", "persoenlich", "arbeitszeit", "Kurzfristige Änderungen des Dienstplans prüfen.", 1, "in_bearbeitung", userId, isoDay(4), userId);
    db.prepare(`INSERT INTO agreements (id,council_id,reference,title,category,status,valid_from,review_at,owner_id,summary,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(agreementId, councilId, "BV-2026-001", "Mobile Arbeit", "arbeitszeit", "verhandlung", isoDay(-30).slice(0,10), isoDay(30).slice(0,10), userId, "Rahmenbedingungen für mobiles Arbeiten und Nichterreichbarkeit.", userId);
  })();
}
