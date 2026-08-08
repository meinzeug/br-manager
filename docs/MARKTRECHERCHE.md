# Markt- und Rechtsrecherche

Stand: 8. August 2026. Untersucht wurden öffentlich beschriebene Funktionen spezialisierter Betriebsrats- und Gremienlösungen. Es wurde kein fremder Programmcode übernommen; BR Manager setzt die erkannten Arbeitsabläufe eigenständig um und verbindet sie mit zusätzlichen Funktionen.

## Betrachtete Lösungen

### BR Manager (e8y Software)

Die öffentlich zugängliche [Funktionsübersicht](https://brmanager.de/funktionen) nennt papierlose Mitbestimmungsvorgänge, Sitzungsplanung, automatisch erzeugte Einladungen/Tagesordnungen/Anwesenheitslisten, Online-Protokoll und PDF, Beschlussübernahme in Vorgänge, E-Mail-Benachrichtigungen, Vorlagen, Gremien/Ausschüsse, ICS-Kalender, Dashboard, Ordner, AES-256-Ablage, 2FA und getrennte Bereiche für BR, JAV oder SBV.

Umsetzung in diesem Projekt: Vorgänge, Sitzungen, Tagesordnung, Teilnahme, Beschlüsse, PDF/ICS, Dashboard, verschlüsselte Dokumente, Gremien/Ausschüsse und rollenbasierte Bereiche. Ergänzt wurden Aufgaben, vertrauliche Anfragen, Vereinbarungen, Seminarplanung, Volltextsuche, Versionierung und Audit-Log.

### meinBRbase (Bund-Verlag)

Die [Produktseite](https://www.bund-verlag.de/meinbrbase) beschreibt Mitgliederverwaltung, Tagesordnung, zentralen Einladungsversand, automatisches Nachladen von Ersatzmitgliedern, Anwesenheitsliste, Niederschrift, Beschlüsse, Export/E-Mail, Datei-Viewer, verschlüsselte Ablage, nachvollziehbare Vertretungsketten, Beschlussvorlagen und rechtliche Arbeitshilfen.

Umsetzung: Mitglieder und Ersatzrang, Einladungs-/Teilnahmestatus, Anwesenheit, Niederschrift/PDF und Beschlussarchiv. Als Verbesserung trennt BR Manager Dateiinhalt, Metadaten und Versionen, authentifiziert jede verschlüsselte Datei und verknüpft Beschlüsse mit dem zugrunde liegenden Mitbestimmungsvorgang.

### Betriebsrat360 (ifb)

[Betriebsrat360](https://www.betriebsrat.de/service/betriebsrat360) bildet in Microsoft Teams den wiederkehrenden Sitzungsprozess ab: Einladung, Tagesordnung, Anwesenheit, Ersatzmitglieder, Protokoll, Unterlagen und geführte Formalien. Konfigurierbare Platzhalter vermeiden Doppelerfassungen; Änderungen der Tagesordnung können erneut kommuniziert werden.

Umsetzung: geführter Vier-Phasen-Sitzungsraum, wiederverwendbare Stammdaten, Teilnahmeformen, formale Einstiegs-TOPs und Protokollstatus. Im Unterschied zur Teams-Bindung ist BR Manager vollständig selbst gehostet und trackerfrei.

### OpenSlides

[OpenSlides für Betriebsräte](https://openslides.com/de/betriebsraete/) führt duplizierbare Tagesordnungen, Anlagen, Protokolle, Beschlüsse, Redelisten, Live-Projektion, detaillierte Rechte, Volltextsuche, elektronische und Umlauf-Abstimmungen sowie Ergebnis-, Verlaufs- und Wortprotokolle auf.

Umsetzung: Tagesordnungs- und Beschlussarbeitsraum, Rechte, Volltextsuche, offene/geheime/namentliche/Umlauf-Abstimmung und Verlaufsprotokoll. Neu kombiniert werden diese Funktionen mit gesetzlichen Beteiligungsfristen, Mitarbeiteranfragen und dem Betriebsvereinbarungsregister.

### SOMACOS Session / SessionNet / Mandatos

Die [SOMACOS-Übersicht](https://somacos.de/) betont Vorbereitung, Durchführung, Nachbereitung, Beschlussrealisierung, ortsunabhängigen Zugriff auf Dokumente und Aufgaben sowie mobile Gremienarbeit.

Umsetzung: responsive Oberfläche, Sitzungszyklus, Aufgaben und Beschlussnachverfolgung. Die selbst gehostete Architektur reduziert Abhängigkeiten und ist als einzelner Linux-Dienst installierbar.

## Abgeleiteter Funktionskatalog

| Arbeitsbereich | Übernommene Marktanforderungen | Erweiterung in BR Manager |
|---|---|---|
| Gremium | Mitglieder, Ersatzmitglieder, Ausschüsse, individuelle Rechte | Mandantenscope, sechs Rollen, JAV/SBV/Wahlvorstand/Arbeitsgruppen |
| Sitzung | Termin, Einladung, Agenda, Unterlagen, Anwesenheit, Protokoll | geführter Status, Hybridteilnahme, Beschlussfähigkeitsprüfung, PDF und ICS |
| Beschlüsse | Volltext, Stimmen, Archiv, Vorgangsbezug | Plausibilitätsprüfung der Stimmen, Quorum, automatische Aktenstatus-Aktualisierung |
| Mitbestimmung | Vorgänge, Dokumente, Referenznummern | Rechtsgrundlage, Frist, Priorität, Zuständigkeit, globale Suche |
| Dokumente | Ordner, Upload, sichere Ablage | AES-256-GCM, Authentifizierungstag, Prüfsumme, Versionen, Aufbewahrungsdatum |
| Zusammenarbeit | Dashboard, Änderungen, Aufgaben | Deadline-Radar, Mitarbeiteranfragen, Seminar- und Vereinbarungsregister |
| Governance | Rechte, Datenschutz, Nachvollziehbarkeit | CSRF, Session-Widerruf, Audit-Log, CSP und gehärtete systemd-Unit |

## Gesetzliche Leitplanken

Die Implementierung orientiert sich an folgenden organisatorischen Anforderungen; ihre korrekte Anwendung bleibt Aufgabe des Gremiums:

- [§ 30 BetrVG](https://www.gesetze-im-internet.de/betrvg/__30.html): Präsenzvorrang, Voraussetzungen für Video-/Telefonteilnahme, Nichtöffentlichkeit und Aufzeichnungsverbot.
- [§§ 33–34 BetrVG](https://www.gesetze-im-internet.de/betrvg/BetrVG.pdf): Mehrheit der Anwesenden, mindestens hälftige Teilnahme für die Beschlussfähigkeit, Wortlaut/Stimmenmehrheit in der Niederschrift und Anwesenheitsliste.
- [§ 79a BetrVG](https://www.gesetze-im-internet.de/betrvg/__79a.html): Pflicht des Betriebsrats zur Einhaltung des Datenschutzes.
- [§ 80 BetrVG](https://www.gesetze-im-internet.de/betrvg/__80.html): allgemeine Aufgaben, Entgegennahme von Anregungen, Informations- und Unterlagenanspruch.
- [§ 99 BetrVG](https://www.gesetze-im-internet.de/betrvg/__99.html): Unterrichtung, Zustimmung und regelmäßig einwöchige Äußerungsfrist bei personellen Einzelmaßnahmen.
- [§ 102 BetrVG](https://www.gesetze-im-internet.de/betrvg/__102.html): Anhörung und unterschiedliche Fristen bei ordentlicher und außerordentlicher Kündigung.

## Bewusste Grenzen

- Kein automatischer Versand vertraulicher Inhalte per E-Mail; Einladungsversand wird derzeit dokumentiert. SMTP/S/MIME kann später installationsspezifisch angebunden werden.
- Keine Audio-/Videoaufzeichnung oder KI-Transkription von Sitzungen, da § 30 BetrVG Aufzeichnungen untersagt und besonders sensible Daten betroffen wären.
- Keine eingebettete Rechtsberatung oder ungeprüfte automatische Rechtsentscheidung. Gesetzesbezüge sind strukturierte Arbeitshilfen.
- Qualifizierte Signatur, eingebetteter Office-Viewer und Ende-zu-Ende-Schlüssel je Gremium sind geeignete nächste Ausbaustufen; der aktuelle Stand bietet TOTP-2FA, serverseitige Verschlüsselung und sichere Sitzungen.
