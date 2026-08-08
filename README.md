# BR Manager

BR Manager ist eine selbst gehostete, deutschsprachige Arbeitsplattform für Betriebsräte. Die Anwendung verbindet Sitzungsmanagement, Mitbestimmungsvorgänge, Fristen, vertrauliche Anliegen, Betriebsvereinbarungen, Aufgaben, Dokumente und Gremienverwaltung in einer responsiven Weboberfläche.

> Fachlicher Hinweis: Die Software unterstützt Organisation und Dokumentation. Sie ersetzt keine Rechtsberatung. Vor Produktiveinsatz müssen das Gremium, der Datenschutzbeauftragte und die zuständige IT das konkrete Betriebs- und Löschkonzept prüfen.

## Funktionsumfang

- Dashboard mit persönlichen Terminen, offenen Vorgängen, Aufgaben, Fristen und Aktivitäten
- durchgängig anklickbare Listen mit URL-verknüpften Detailansichten, Bearbeitungsmasken und Beziehungen zwischen Datensätzen
- universeller Verknüpfungs-Hub für beidseitige Beziehungen zwischen allen Fachmodulen und kontextbezogene Folgeaufgaben
- Gremien, Ausschüsse, JAV, SBV, Arbeitsgruppen, Mitglieder und Ersatzränge
- Rollen: Administration, Vorsitz, Sekretariat, Mitglied, Ersatzmitglied und Lesezugriff
- Sitzungsworkflow von Planung und Einladung bis Durchführung und Abschluss
- Tagesordnung, Anwesenheit, Teilnahmeform, Verhinderung und Ersatzmitgliedbezug
- Beschlüsse mit Beschlusstext, Stimmenverhältnis, Beschlussfähigkeit und Ergebnis
- PDF-Niederschrift und abonnierbarer ICS-Sitzungskalender
- Mitbestimmungsakten mit Aktenzeichen, Rechtsgrundlage, Priorität, Frist und Zuständigkeit
- Aufgaben, Wiedervorlagen und Verknüpfungen zu Vorgängen und Sitzungen
- direkte Zuordnung von Dokumenten zu Vorgängen, Sitzungen und Vereinbarungen sowie von Seminaren zu Entsendebeschlüssen
- AES-256-GCM-verschlüsselte Dokumentablage mit Versionen, Prüfsumme und Aufbewahrungsdatum
- Vertrauliche Mitarbeiteranfragen mit dokumentierter Einwilligung
- Betriebsvereinbarungsregister mit Verhandlung, Laufzeit, Kündigungsfrist, Nachwirkung und Review
- Seminar- und Schulungsplanung mit Status, Kosten und Beschlussbezug
- globale Direktsuche, persönliche Benachrichtigungen sowie mandantenscharfes Audit-Protokoll
- lokaler, trackerfreier Betrieb ohne externe Cloud- oder Schriftart-Abhängigkeit

Die zugrunde liegende Markt- und Rechtsrecherche ist in [docs/MARKTRECHERCHE.md](docs/MARKTRECHERCHE.md) dokumentiert.

## Architektur

- Frontend: React 19, TypeScript, Vite, responsive CSS
- Backend: Node.js 22, Express 5, Zod
- SQL: SQLite im WAL-Modus mit Fremdschlüsseln und Indizes
- Authentifizierung: bcrypt (Kostenfaktor 12), zufällige serverseitige Sessions, HttpOnly-/SameSite-Cookie und optionale TOTP-2FA
- Sicherheit: CSRF-Token, Security-Header/CSP, Anmeldebegrenzung, RBAC, Mandantenscope und Audit-Log
- Dateien: AES-256-GCM, zufällige Nonces, SHA-256-Prüfsumme, maximal 25 MB
- Betrieb: gehärtete systemd-Unit, restriktive Dateirechte, geordneter Shutdown

## Entwicklung

Voraussetzungen: Node.js 22 oder neuer und npm.

```bash
npm install
npm run dev
```

Im Entwicklungsmodus wird bei leerer Datenbank der Zugang `admin@betriebsrat.local` mit dem Passwort `Betriebsrat!2026` angelegt. Das Initialpasswort muss bei der ersten Anmeldung geändert werden. Dieser feste Zugang darf nicht produktiv verwendet werden.

Wichtige Befehle:

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Produktiver systemd-Betrieb

Das Installationsskript baut die Anwendung, erzeugt einmalige kryptografische Schlüssel und ein zufälliges Initialpasswort, legt `/var/lib/br-manager` an und installiert die gehärtete Unit:

```bash
./scripts/install-service.sh
```

Ohne Root-Rechte steht alternativ ein gehärteter systemd-Benutzerdienst zur Verfügung. Er nutzt `~/.local/share/br-manager` und `~/.config/br-manager/env`:

```bash
./scripts/install-user-service.sh
```

Danach ist BR Manager standardmäßig nur lokal unter <http://127.0.0.1:3000> erreichbar. Status und Log:

```bash
systemctl status br-manager
journalctl -u br-manager -f
```

Beim Benutzerdienst werden die Befehle mit `systemctl --user` beziehungsweise `journalctl --user` ausgeführt. Die systemweite Konfiguration liegt in `/etc/br-manager.env`, Datenbank und Uploads in `/var/lib/br-manager`; beim Benutzerdienst entsprechend in `~/.config/br-manager/env` und `~/.local/share/br-manager`. Für Zugriff aus dem Netz sollte ein TLS-Reverse-Proxy vorgeschaltet, `COOKIE_SECURE=true` gesetzt und `TRUST_PROXY=true` geprüft werden.

Deinstallation der Unit ohne Löschen der Daten:

```bash
./scripts/uninstall-service.sh
```

## Datensicherung

SQLite läuft im WAL-Modus. Für eine konsistente Sicherung sollte die SQLite-Backup-API verwendet oder der Dienst kurz gestoppt und das vollständige Datenverzeichnis zusammen mit der jeweiligen Konfigurationsdatei gesichert werden. Der Dateischlüssel ist für die Wiederherstellung zwingend erforderlich und muss getrennt geschützt werden.

## Rollenmodell

| Funktion | Admin/Vorsitz | Sekretariat | Mitglied | Ersatzmitglied | Lesezugriff |
|---|---:|---:|---:|---:|---:|
| Lesen der Gremiumsdaten | ja | ja | ja | ja | ja |
| Sitzungen/Vorgänge bearbeiten | ja | ja | ja | nein | nein |
| Aufgaben/Anfragen bearbeiten | ja | ja | ja | ja | nein |
| Mitglieder/Gremium verwalten | ja | Mitglieder | nein | nein | nein |
| Einstellungen/Audit | ja | nein | nein | nein | nein |

Alle serverseitigen Abfragen werden zusätzlich auf die Gremiums-ID des angemeldeten Kontos begrenzt.
