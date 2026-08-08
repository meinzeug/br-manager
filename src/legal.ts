import rawLaw from "./data/betrvg.json" with { type: "json" };

export interface LegalProvision {
  id: string;
  citation: string;
  title: string;
  chapter: string;
  text: string;
  sourceUrl: string;
}

export interface ProcedureStep {
  key: string;
  title: string;
  description: string;
  offsetDays?: number;
  priority?: "normal" | "hoch" | "kritisch";
}

export interface ProcedureTemplate {
  id: string;
  title: string;
  group: string;
  category: string;
  situation: string;
  plainLanguage: string;
  firstQuestion: string;
  legalSections: string[];
  riskLevel: "normal" | "hoch" | "kritisch";
  deadlineDays?: number;
  deadlineNote: string;
  steps: ProcedureStep[];
}

export const betrvg = rawLaw as Omit<typeof rawLaw, "provisions"> & { provisions: LegalProvision[] };

const normalise = (value: string) => value.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const step = (key: string, title: string, description: string, offsetDays?: number, priority: ProcedureStep["priority"] = "normal"): ProcedureStep => ({ key, title, description, offsetDays, priority });
const standardDeadline = "Die angezeigte Frist ist eine Arbeitshilfe. Zugang, Fristbeginn, Wochenenden, Feiertage, Tarifvertrag und Sonderregeln müssen im konkreten Fall geprüft werden.";
const noFixedDeadline = "Das BetrVG nennt hierfür keine einheitliche Standardfrist. Termin und Wiedervorlage bewusst festlegen; bei Unsicherheit frühzeitig fachkundigen Rat einholen.";

export const procedureTemplates: ProcedureTemplate[] = [
  {
    id: "ordentliche-kuendigung", title: "Ordentliche Kündigung – Anhörung", group: "Personal", category: "kuendigung", riskLevel: "kritisch", deadlineDays: 7,
    situation: "Der Arbeitgeber hört den Betriebsrat vor einer ordentlichen Kündigung an.",
    plainLanguage: "Eine Kündigung darf nicht ausgesprochen werden, bevor der Betriebsrat angehört wurde. Das Gremium prüft die Angaben, hört bei Bedarf die betroffene Person an und beschließt innerhalb der kurzen Frist eine Stellungnahme.",
    firstQuestion: "Sind Person, Kündigungsart, Gründe, Kündigungstermin und Sozialdaten vollständig mitgeteilt worden?",
    legalSections: ["102", "80", "95"], deadlineNote: standardDeadline,
    steps: [step("eingang", "Eingang und Zugang sichern", "Eingangszeitpunkt, Übermittlungsweg und vollständige Arbeitgeberunterlagen dokumentieren.", 0, "kritisch"), step("vollstaendigkeit", "Angaben vollständig prüfen", "Kündigungsart, Gründe, Sozialdaten, Auswahl und Kündigungstermin mit einer Vier-Augen-Prüfung kontrollieren.", 1, "kritisch"), step("anhoerung", "Betroffene Person anhören", "Sicht der betroffenen Person vertraulich aufnehmen, sofern dies erforderlich und möglich ist.", 2, "hoch"), step("beratung", "Gremium beraten lassen", "Sachverhalt und mögliche Bedenken oder Widerspruchsgründe auf die Tagesordnung setzen.", 4, "kritisch"), step("beschluss", "Stellungnahme beschließen", "Beschlussfähigkeit prüfen, Wortlaut und Abstimmung sauber protokollieren.", 6, "kritisch"), step("uebermittlung", "Fristgerecht übermitteln", "Nachweisbare Übermittlung an den Arbeitgeber sichern und Vorgang dokumentieren.", 7, "kritisch")],
  },
  {
    id: "ausserordentliche-kuendigung", title: "Außerordentliche Kündigung – Anhörung", group: "Personal", category: "kuendigung", riskLevel: "kritisch", deadlineDays: 3,
    situation: "Der Arbeitgeber hört den Betriebsrat vor einer fristlosen oder außerordentlichen Kündigung an.",
    plainLanguage: "Hier läuft regelmäßig nur eine sehr kurze Frist. Sofort zustellen, Unterlagen priorisieren und eine rechtssichere Beschlussfassung organisieren.",
    firstQuestion: "Wann und mit welchen vollständigen Gründen ist die Anhörung tatsächlich eingegangen?",
    legalSections: ["102", "33", "34"], deadlineNote: standardDeadline,
    steps: [step("eingang", "Zugang minutengenau erfassen", "Eingang, Uhrzeit, Übermittlungsweg und Unterlagen sofort dokumentieren.", 0, "kritisch"), step("triage", "Sofortprüfung organisieren", "Vorsitz und Vertretung informieren; Vollständigkeit und Kündigungsart prüfen.", 0, "kritisch"), step("sitzung", "Dringende Sitzung vorbereiten", "Ordnungsgemäß laden, Verhinderung und Ersatzmitglieder prüfen.", 1, "kritisch"), step("beschluss", "Stellungnahme beschließen", "Bedenken mit Tatsachen belegen und Abstimmung dokumentieren.", 2, "kritisch"), step("uebermittlung", "Nachweisbar übermitteln", "Rechtzeitig absenden und Zugangsnachweis ablegen.", 3, "kritisch")],
  },
  {
    id: "personelle-massnahme", title: "Einstellung, Versetzung oder Umgruppierung", group: "Personal", category: "personelle_massnahme", riskLevel: "kritisch", deadlineDays: 7,
    situation: "Der Arbeitgeber beantragt die Zustimmung zu einer personellen Einzelmaßnahme.",
    plainLanguage: "Das Gremium prüft Unterlagen, interne Ausschreibung, Auswahl und mögliche Zustimmungsverweigerungsgründe. Schweigen kann nach Fristablauf als Zustimmung wirken.",
    firstQuestion: "Sind alle Bewerbungs-, Stellen-, Auswahl- und Eingruppierungsinformationen vollständig?",
    legalSections: ["99", "95", "93", "101"], deadlineNote: standardDeadline,
    steps: [step("eingang", "Antrag und Frist erfassen", "Zugang und beantragte Maßnahmenart dokumentieren.", 0, "kritisch"), step("unterlagen", "Unterlagen vollständig prüfen", "Person, Arbeitsplatz, Eingruppierung, Bewerberlage und Auswirkungen prüfen.", 1, "kritisch"), step("gruende", "Prüfgründe abgleichen", "Mögliche Gründe aus § 99 Abs. 2 anhand konkreter Tatsachen prüfen.", 3, "hoch"), step("beschluss", "Zustimmung oder Verweigerung beschließen", "Bei Verweigerung Gründe konkret und nachvollziehbar formulieren.", 6, "kritisch"), step("uebermittlung", "Schriftlich mitteilen", "Beschluss fristgerecht und nachweisbar übermitteln.", 7, "kritisch")],
  },
  {
    id: "vorlaeufige-personelle-massnahme", title: "Vorläufige personelle Maßnahme", group: "Personal", category: "personelle_massnahme", riskLevel: "kritisch", deadlineDays: 3,
    situation: "Der Arbeitgeber führt eine personelle Maßnahme vorläufig durch und beruft sich auf sachliche Dringlichkeit.",
    plainLanguage: "Das ist ein Eilverfahren. Bestreitet der Betriebsrat die Dringlichkeit, muss der Arbeitgeber innerhalb kurzer Zeit das Arbeitsgericht anrufen.",
    firstQuestion: "Hat der Arbeitgeber die sachliche Dringlichkeit tatsächlich und nachvollziehbar begründet?",
    legalSections: ["100", "99", "101"], deadlineNote: standardDeadline,
    steps: [step("eingang", "Mitteilung sofort erfassen", "Zugang und Dringlichkeitsbegründung sichern.", 0, "kritisch"), step("pruefung", "Dringlichkeit prüfen", "Tatsachen, Planbarkeit und Alternativen bewerten.", 1, "kritisch"), step("beschluss", "Bestreiten oder akzeptieren", "Gremium beschließen und konkrete Gründe dokumentieren.", 2, "kritisch"), step("mitteilung", "Arbeitgeber informieren", "Beschluss unverzüglich nachweisbar mitteilen; gerichtlichen Fortgang überwachen.", 3, "kritisch")],
  },
  {
    id: "arbeitszeit-schichtplan", title: "Arbeitszeit, Dienst- oder Schichtplan", group: "Arbeitsbedingungen", category: "arbeitszeit", riskLevel: "hoch",
    situation: "Beginn, Ende, Pausen, Verteilung oder ein Schichtmodell sollen geändert werden.",
    plainLanguage: "Bei der konkreten Lage und Verteilung der Arbeitszeit hat der Betriebsrat mitzubestimmen. Ziel ist eine klare, faire und praktisch überprüfbare Regelung.",
    firstQuestion: "Was ändert sich für welche Beschäftigtengruppen und ab wann?",
    legalSections: ["87", "80"], deadlineNote: noFixedDeadline,
    steps: [step("sachstand", "Änderung verständlich erfassen", "Alt-/Neu-Vergleich, betroffene Gruppen und Starttermin dokumentieren."), step("bedarf", "Beschäftigteninteressen ermitteln", "Planbarkeit, Betreuung, Belastung, Gleichbehandlung und Wünsche berücksichtigen."), step("forderung", "Regelungspunkte festlegen", "Dienstplanfristen, Tausch, Pausen, Ausnahmen und Kontrolle definieren."), step("verhandlung", "Mit Arbeitgeber verhandeln", "Zwischenergebnisse und offene Punkte nachvollziehbar festhalten."), step("abschluss", "Beschluss und Umsetzung", "Vereinbarung beschließen, kommunizieren und Überprüfung terminieren.")],
  },
  {
    id: "mehrarbeit-ueberstunden", title: "Mehrarbeit oder Überstunden", group: "Arbeitsbedingungen", category: "arbeitszeit", riskLevel: "hoch",
    situation: "Überstunden oder Mehrarbeit sollen angeordnet, verlängert oder regelmäßig genutzt werden.",
    plainLanguage: "Der Betriebsrat prüft Anlass, Umfang, Verteilung, Belastung und Alternativen. Auch kurzfristige Anordnungen sind nicht automatisch mitbestimmungsfrei.",
    firstQuestion: "Für wen, wann, wie lange und aus welchem konkreten Grund wird Mehrarbeit verlangt?",
    legalSections: ["87", "80", "89"], deadlineNote: noFixedDeadline,
    steps: [step("antrag", "Antrag konkretisieren", "Zeitraum, Personen, Stunden, Anlass und Freiwilligkeit erfassen."), step("schutz", "Belastung und Schutz prüfen", "Ruhezeiten, Höchstzeiten, Gesundheit und Gleichverteilung berücksichtigen."), step("alternativen", "Alternativen bewerten", "Personalplanung, Priorisierung oder Verschiebung prüfen."), step("beschluss", "Position beschließen", "Zustimmung, Auflagen oder Ablehnung dokumentieren."), step("kontrolle", "Umsetzung kontrollieren", "Tatsächliche Stunden und Ausgleich auswerten.")],
  },
  {
    id: "urlaubsgrundsaetze", title: "Urlaubsgrundsätze und Urlaubsplan", group: "Arbeitsbedingungen", category: "arbeitszeit", riskLevel: "normal",
    situation: "Urlaubsregeln, Betriebsurlaub oder ein Urlaubsplan werden gestaltet; Wünsche kollidieren.",
    plainLanguage: "Der Betriebsrat achtet auf transparente Grundsätze, faire soziale Kriterien und ein nachvollziehbares Konfliktverfahren.",
    firstQuestion: "Welche Regeln gelten bisher und welche Beschäftigtenwünsche stehen konkret im Konflikt?",
    legalSections: ["87", "75"], deadlineNote: noFixedDeadline,
    steps: [step("bestand", "Bestehende Regeln sammeln", "Tarifvertrag, Betriebsvereinbarung und gelebte Praxis abgleichen."), step("kriterien", "Faire Kriterien entwickeln", "Soziale Gesichtspunkte und Gleichbehandlung transparent gewichten."), step("konflikt", "Konfliktfälle klären", "Wünsche, betriebliche Gründe und Alternativen dokumentieren."), step("beschluss", "Regelung beschließen", "Verfahren, Zuständigkeiten und Kommunikation festlegen."), step("review", "Saison auswerten", "Beschwerden und Abweichungen nach der Urlaubsphase überprüfen.")],
  },
  {
    id: "it-system-ueberwachung", title: "IT-System oder technische Überwachung", group: "Digitalisierung", category: "technische_einrichtung", riskLevel: "hoch",
    situation: "Software, Hardware oder ein digitales Verfahren kann Verhalten oder Leistung erfassen oder auswerten.",
    plainLanguage: "Entscheidend ist nicht nur, ob Überwachung beabsichtigt ist, sondern ob das System technisch dafür geeignet ist. Der Betriebsrat braucht verständliche und vollständige Informationen.",
    firstQuestion: "Welche Daten entstehen, wer sieht sie, wie lange bleiben sie gespeichert und welche Auswertungen sind technisch möglich?",
    legalSections: ["87", "80", "90", "79a"], deadlineNote: noFixedDeadline,
    steps: [step("systembild", "System und Zweck verstehen", "Funktionen, Datenflüsse, Rollen, Schnittstellen und Anbieter dokumentieren.", undefined, "hoch"), step("risiko", "Überwachungs- und Datenschutzrisiken prüfen", "Auswertbarkeit, Zweckänderung, Löschung und Zugriffe bewerten.", undefined, "hoch"), step("anforderung", "Schutzanforderungen formulieren", "Zweckbindung, Minimaldaten, Transparenz, Kontrollen und Sanktionen definieren."), step("pilot", "Pilot und Tests vereinbaren", "Testgruppe, Erfolgskriterien, Abbruchregeln und Protokolle festlegen."), step("vereinbarung", "Betriebsvereinbarung abschließen", "Verbindliche Regeln beschließen und technische Umsetzung kontrollieren."), step("audit", "Regelmäßig überprüfen", "Berechtigungen, Auswertungen und Änderungen wiederkehrend prüfen.")],
  },
  {
    id: "ki-einfuehrung", title: "KI-System am Arbeitsplatz", group: "Digitalisierung", category: "technische_einrichtung", riskLevel: "hoch",
    situation: "Künstliche Intelligenz soll auswählen, bewerten, planen, unterstützen oder Inhalte erzeugen.",
    plainLanguage: "KI kann mehrere Beteiligungsrechte gleichzeitig berühren. Der Assistent führt vom verständlichen Systemzweck über Risiken bis zu verbindlichen Kontrollregeln.",
    firstQuestion: "Welche Entscheidung beeinflusst die KI und kann ein Mensch das Ergebnis nachvollziehen und korrigieren?",
    legalSections: ["80", "87", "90", "94", "95", "79a"], deadlineNote: noFixedDeadline,
    steps: [step("inventar", "KI-Einsatz beschreiben", "Zweck, Modell, Eingabedaten, Ergebnisse, Anbieter und betroffene Personen erfassen."), step("entscheidung", "Einfluss auf Entscheidungen prüfen", "Automatisierung, menschliche Kontrolle und Widerspruchsmöglichkeiten klären.", undefined, "hoch"), step("risiko", "Risiken bewerten", "Diskriminierung, Fehler, Überwachung, Datenschutz und Qualifikationsfolgen prüfen.", undefined, "hoch"), step("expertise", "Sachverständige Hilfe prüfen", "Fehlendes technisches oder rechtliches Wissen sichtbar machen und Unterstützung beschließen."), step("regeln", "Leitplanken verhandeln", "Transparenz, verbotene Nutzungen, Kontrollen, Schulung und Abschaltung regeln."), step("monitoring", "Wirkung fortlaufend prüfen", "Fehler, Beschwerden und Modelländerungen in einem festen Turnus auswerten.")],
  },
  {
    id: "mobile-arbeit", title: "Mobile Arbeit ausgestalten", group: "Digitalisierung", category: "arbeitszeit", riskLevel: "normal",
    situation: "Regeln für mobile Arbeit oder Homeoffice werden eingeführt oder verändert.",
    plainLanguage: "Das Gremium gestaltet die Ausgestaltung mobiler Arbeit mit: Zugang, Arbeitszeit, Erreichbarkeit, Ausstattung, Datenschutz und faire Teilhabe gehören zusammen.",
    firstQuestion: "Wer darf unter welchen nachvollziehbaren Bedingungen mobil arbeiten?",
    legalSections: ["87", "90", "80"], deadlineNote: noFixedDeadline,
    steps: [step("ziel", "Ziele und Betroffene klären", "Tätigkeiten, Ausschlussgründe und Umfang transparent erfassen."), step("katalog", "Regelungskatalog erstellen", "Antrag, Auswahl, Arbeitszeit, Erreichbarkeit, Kosten, Ausstattung und Rückkehr regeln."), step("schutz", "Schutz und Datenschutz prüfen", "Arbeitsplatz, Unfallrisiken, Datenzugriff und Kontrollmöglichkeiten berücksichtigen."), step("verhandlung", "Vereinbarung verhandeln", "Konflikt- und Beschwerdeweg sowie Pilotphase vorsehen."), step("review", "Praxis auswerten", "Nutzung, Ablehnungen, Mehrbelastung und Gleichbehandlung messen.")],
  },
  {
    id: "gesundheitsschutz", title: "Arbeits- und Gesundheitsschutz", group: "Schutz & Teilhabe", category: "gesundheitsschutz", riskLevel: "hoch",
    situation: "Belastungen, Gefährdungen, Unfälle oder unzureichende Schutzmaßnahmen werden bekannt.",
    plainLanguage: "Der Betriebsrat macht Gefährdungen sichtbar, fordert Informationen und gestaltet konkrete Schutzmaßnahmen und Wirksamkeitskontrollen mit.",
    firstQuestion: "Welche konkrete Gefährdung betrifft wen, wie häufig und mit welchen Folgen?",
    legalSections: ["87", "89", "90", "91"], deadlineNote: noFixedDeadline,
    steps: [step("meldung", "Gefährdung erfassen", "Beobachtungen, betroffene Bereiche und akute Schutzbedarfe dokumentieren.", undefined, "hoch"), step("sofort", "Sofortmaßnahmen prüfen", "Bei akuter Gefahr unverzügliche Sicherung und zuständige Stellen anstoßen.", undefined, "kritisch"), step("analyse", "Ursachen untersuchen", "Gefährdungsbeurteilung, Unfallmeldungen und Beschäftigtenwissen einbeziehen."), step("massnahmen", "Maßnahmen mitbestimmen", "Technische, organisatorische und persönliche Schutzmaßnahmen priorisieren."), step("wirksamkeit", "Wirksamkeit kontrollieren", "Messgrößen, Verantwortliche und Überprüfungstermin festlegen.")],
  },
  {
    id: "beschwerde", title: "Beschwerde eines Beschäftigten", group: "Schutz & Teilhabe", category: "beschwerde", riskLevel: "hoch",
    situation: "Ein Beschäftigter bittet den Betriebsrat um Unterstützung bei einer Beschwerde.",
    plainLanguage: "Das Anliegen wird vertraulich, fair und ohne Benachteiligung aufgenommen. Der Betriebsrat prüft, ob die Beschwerde berechtigt ist, und wirkt beim Arbeitgeber auf Abhilfe hin.",
    firstQuestion: "Was soll sich aus Sicht der betroffenen Person konkret ändern und wer darf welche Information erhalten?",
    legalSections: ["84", "85", "75", "79"], deadlineNote: noFixedDeadline,
    steps: [step("aufnahme", "Vertraulich aufnehmen", "Anliegen, Ziel, Dringlichkeit und Einwilligung zur weiteren Verwendung festhalten."), step("schutz", "Akuten Schutzbedarf prüfen", "Benachteiligung, Gesundheit, Eskalation und Beweissicherung berücksichtigen."), step("pruefung", "Sachverhalt fair prüfen", "Erforderliche Informationen trennen, Gegensicht nur mit geklärtem Vorgehen einholen."), step("beschluss", "Berechtigung bewerten", "Gremienbefassung und Abhilfeforderung nachvollziehbar festlegen."), step("abhilfe", "Auf Abhilfe hinwirken", "Verabredete Schritte, Rückmeldung und Wiedervorlage dokumentieren.")],
  },
  {
    id: "gleichbehandlung", title: "Benachteiligung oder Diskriminierung", group: "Schutz & Teilhabe", category: "gleichstellung", riskLevel: "hoch",
    situation: "Es gibt Hinweise auf Benachteiligung, Diskriminierung oder unterschiedliche Behandlung.",
    plainLanguage: "Der Betriebsrat schützt Betroffene, prüft Muster und drängt auf Abhilfe. Personenbezogene Details werden nur soweit nötig zugänglich gemacht.",
    firstQuestion: "Welche Handlung oder Regel wirkt für welche Gruppe nachteilig und welche Belege gibt es?",
    legalSections: ["75", "80", "84", "85"], deadlineNote: noFixedDeadline,
    steps: [step("schutz", "Vertraulichkeit und Schutz klären", "Einwilligung, Kreis der Informierten und akute Maßnahmen abstimmen."), step("fakten", "Fakten und Vergleich sammeln", "Vorfälle, Kriterien, Vergleichsfälle und Auswirkungen strukturiert erfassen."), step("muster", "Strukturelle Ursache prüfen", "Einzelfall und mögliche systematische Regel oder Praxis unterscheiden."), step("forderung", "Abhilfe beschließen", "Konkrete Schutz-, Korrektur- und Präventionsmaßnahmen formulieren."), step("nachhalten", "Umsetzung nachhalten", "Rückmeldung an Betroffene und Wirksamkeitskontrolle terminieren.")],
  },
  {
    id: "betriebsvereinbarung", title: "Betriebsvereinbarung entwickeln", group: "Regelungen", category: "betriebsvereinbarung", riskLevel: "normal",
    situation: "Ein Thema soll verbindlich und dauerhaft zwischen Betriebsrat und Arbeitgeber geregelt werden.",
    plainLanguage: "Der Assistent führt von Ziel und Geltungsbereich über Muss-Regelungen bis zu Beschluss, Unterschrift, Kommunikation und späterer Kontrolle.",
    firstQuestion: "Welches konkrete Problem soll die Vereinbarung für welche Beschäftigten lösen?",
    legalSections: ["77", "87", "88"], deadlineNote: noFixedDeadline,
    steps: [step("auftrag", "Regelungsauftrag beschließen", "Ziel, Verhandlungsteam, Zeitplan und Beteiligte festlegen."), step("bestand", "Rechts- und Regelungsbestand prüfen", "Gesetz, Tarifvertrag, bestehende Vereinbarungen und Praxis abgleichen."), step("entwurf", "Vollständigen Entwurf erstellen", "Zweck, Geltung, Rechte, Verfahren, Kontrolle, Konfliktlösung und Laufzeit regeln."), step("verhandlung", "Versionen verhandeln", "Änderungen, Dissens und Zusagen nachvollziehbar dokumentieren."), step("abschluss", "Beschließen und unterzeichnen", "Gremium beschließen lassen, schriftlich niederlegen und unterzeichnen."), step("einfuehrung", "Bekanntmachen und kontrollieren", "Beschäftigte informieren, Verantwortliche schulen und Review terminieren.")],
  },
  {
    id: "betriebsanderung", title: "Betriebsänderung / Umstrukturierung", group: "Wirtschaft", category: "umstrukturierung", riskLevel: "kritisch",
    situation: "Einschränkung, Stilllegung, Verlegung, Zusammenschluss, Spaltung oder grundlegende Organisationsänderung steht an.",
    plainLanguage: "Frühe und vollständige Information ist entscheidend. Der Betriebsrat organisiert Expertise, bewertet Folgen und verhandelt Interessenausgleich und gegebenenfalls Sozialplan.",
    firstQuestion: "Welche Entscheidung ist geplant, wie weit ist sie bereits vorbereitet und welche Nachteile drohen welchen Beschäftigten?",
    legalSections: ["111", "112", "112a", "113", "80"], deadlineNote: noFixedDeadline,
    steps: [step("fruehwarnung", "Planung und Informationsstand sichern", "Zeitlinie, Beschlusslage, Alternativen und betroffene Bereiche dokumentieren.", undefined, "kritisch"), step("team", "Projektteam und Beratung aufstellen", "Zuständigkeiten, Sachverständige, Gewerkschaft und Kommunikationsweg festlegen.", undefined, "hoch"), step("daten", "Vollständige Informationen fordern", "Personal-, Standort-, Kosten-, Zeit- und Alternativplanung strukturiert abfragen."), step("folgen", "Folgen und Alternativen bewerten", "Arbeitsplätze, Qualifikation, Wege, Einkommen und besondere Schutzbedarfe analysieren."), step("verhandlung", "Interessenausgleich verhandeln", "Ob, wann und wie der Änderung verhandeln; Zwischenergebnisse dokumentieren."), step("sozialplan", "Nachteilsausgleich regeln", "Ausgleichsleistungen, Qualifizierung, Auswahl und Härtefälle verhandeln."), step("kontrolle", "Umsetzung überwachen", "Abweichungen, Verstöße und individuelle Maßnahmen nachhalten.")],
  },
  {
    id: "wirtschaftsausschuss", title: "Wirtschaftsausschuss – Beratung", group: "Wirtschaft", category: "wirtschaftsausschuss", riskLevel: "hoch",
    situation: "Wirtschaftliche Angelegenheiten sollen strukturiert mit dem Unternehmer beraten werden.",
    plainLanguage: "Das Verfahren sammelt Fragen und Unterlagen, macht fehlende Informationen sichtbar und sorgt für eine verständliche Berichterstattung an den Betriebsrat.",
    firstQuestion: "Welche wirtschaftliche Entwicklung kann Auswirkungen auf Beschäftigung oder Betrieb haben?",
    legalSections: ["106", "107", "108", "109", "110"], deadlineNote: noFixedDeadline,
    steps: [step("themen", "Themen und Signale sammeln", "Kennzahlen, Investitionen, Auslastung, Personalplanung und Veränderungen bündeln."), step("unterlagen", "Unterlagen anfordern und prüfen", "Vollständigkeit, Verständlichkeit und Widersprüche dokumentieren."), step("fragen", "Fragenkatalog priorisieren", "Auswirkungen auf Beschäftigte und Handlungsalternativen in den Mittelpunkt stellen."), step("beratung", "Sitzung durchführen", "Antworten, Zusagen, offene Punkte und Geheimhaltungsstatus protokollieren."), step("bericht", "Betriebsrat verständlich informieren", "Erkenntnisse, Risiken und empfohlene Entscheidungen adressatengerecht berichten."), step("followup", "Offene Punkte nachhalten", "Fehlende Auskünfte eskalieren und Termin setzen.")],
  },
  {
    id: "sitzung-beschluss", title: "Sitzung, Beschluss und Niederschrift", group: "Gremienarbeit", category: "gremienarbeit", riskLevel: "hoch",
    situation: "Eine ordnungsgemäße Sitzung und belastbare Beschlussfassung werden vorbereitet.",
    plainLanguage: "Der Assistent erinnert an Ladung, Tagesordnung, Verhinderung, Ersatzmitglieder, Beschlussfähigkeit, Abstimmung und die vorgeschriebene Niederschrift.",
    firstQuestion: "Sind alle teilnahmeberechtigten Personen rechtzeitig und mit einer klaren Tagesordnung geladen?",
    legalSections: ["29", "30", "33", "34", "25"], deadlineNote: noFixedDeadline,
    steps: [step("tagesordnung", "Tagesordnung fertigstellen", "Entscheidungsgegenstände eindeutig benennen und Unterlagen zuordnen."), step("ladung", "Ordnungsgemäß laden", "Zeit, Ort, Tagesordnung und erforderliche Unterlagen rechtzeitig übermitteln."), step("vertretung", "Verhinderung und Ersatz prüfen", "Abwesenheitsgründe dokumentieren und passende Ersatzmitglieder laden."), step("beschlussfaehigkeit", "Beschlussfähigkeit feststellen", "Anwesende, Teilnahmeform und erforderliche Mitgliederzahl prüfen."), step("abstimmung", "Klaren Beschluss fassen", "Wortlaut vor Abstimmung festhalten und Stimmen korrekt zählen."), step("niederschrift", "Niederschrift abschließen", "Beschlusswortlaut, Mehrheit, Unterschriften und Anwesenheitsliste vollständig sichern.")],
  },
  {
    id: "schulung", title: "Erforderliche BR-Schulung", group: "Gremienarbeit", category: "schulung", riskLevel: "normal",
    situation: "Ein Mitglied benötigt Wissen, um aktuelle oder absehbare Betriebsratsaufgaben erfüllen zu können.",
    plainLanguage: "Thema, konkreter Wissensbedarf, Teilnehmer, Anbieter, Dauer und Kosten werden so dokumentiert, dass das Gremium eine nachvollziehbare Entsendung beschließen kann.",
    firstQuestion: "Welche konkrete Betriebsratsaufgabe kann das Mitglied ohne diese Kenntnisse nicht sicher bearbeiten?",
    legalSections: ["37", "40", "96", "97", "98"], deadlineNote: noFixedDeadline,
    steps: [step("bedarf", "Wissensbedarf begründen", "Aufgabe, vorhandene Kenntnisse und konkrete Lücke beschreiben."), step("angebot", "Geeignetes Angebot auswählen", "Inhalt, Termin, Anbieter, Kosten und betriebliche Belange vergleichen."), step("beschluss", "Entsendung beschließen", "Teilnehmer, Seminar, Termin, Kosten und Erforderlichkeit eindeutig festhalten."), step("mitteilung", "Arbeitgeber rechtzeitig informieren", "Beschluss und organisatorische Angaben nachweisbar mitteilen."), step("transfer", "Wissen ins Gremium bringen", "Erkenntnisse, Unterlagen und nächste Maßnahmen nach dem Seminar teilen.")],
  },
  {
    id: "br-wahl", title: "Betriebsratswahl vorbereiten", group: "Gremienarbeit", category: "wahl", riskLevel: "kritisch",
    situation: "Eine regelmäßige oder außerordentliche Betriebsratswahl ist vorzubereiten.",
    plainLanguage: "Die Wahl ist ein eigenes, formstrenges Verfahren. Dieses Muster dient als Einstieg und verweist bewusst auf Wahlordnung, Gewerkschaft oder fachkundige Wahlbegleitung.",
    firstQuestion: "Warum und zu welchem Termin ist zu wählen und welches Wahlverfahren gilt für den Betrieb?",
    legalSections: ["13", "14", "14a", "16", "17", "18", "19", "20"], deadlineNote: "Wahlfristen hängen von Wahlgrund, Betriebsgröße und Wahlordnung ab. Dieses Muster ersetzt keinen vollständigen Wahlkalender; Verfahren fachkundig absichern.",
    steps: [step("anlass", "Wahlgrund und Termin bestimmen", "Regelwahl, Neuwahlgrund, Amtszeit und Betriebsstruktur klären.", undefined, "kritisch"), step("wahlvorstand", "Wahlvorstand bestellen", "Zuständiges Gremium, Zusammensetzung und rechtzeitige Bestellung sichern.", undefined, "kritisch"), step("verfahren", "Wahlverfahren festlegen", "Betriebsgröße, Wahlordnung und mögliche Sonderfälle fachkundig prüfen."), step("kalender", "Verbindlichen Wahlkalender erstellen", "Alle Fristen, Verantwortliche, Bekanntmachungen und Nachweise erfassen."), step("durchfuehrung", "Wahl geschützt durchführen", "Neutralität, Datenschutz, Geheimhaltung und Dokumentation sicherstellen."), step("abschluss", "Ergebnis und Übergang sichern", "Bekanntgabe, konstituierende Sitzung, Unterlagen und mögliche Anfechtungsrisiken beachten.")],
  },
  {
    id: "datenschutz", title: "Datenschutz in der Betriebsratsarbeit", group: "Gremienarbeit", category: "datenschutz", riskLevel: "hoch",
    situation: "Das Gremium verarbeitet Beschäftigtendaten, besondere Kategorien oder vertrauliche Unterlagen.",
    plainLanguage: "Der Betriebsrat organisiert Zugriff, Zweck, Löschung und sichere Arbeitsweisen. Er wahrt den Datenschutz innerhalb seines Verantwortungsbereichs.",
    firstQuestion: "Braucht das Gremium diese personenbezogenen Daten wirklich für eine konkrete gesetzliche Aufgabe?",
    legalSections: ["79a", "79", "80"], deadlineNote: noFixedDeadline,
    steps: [step("zweck", "Aufgabe und Datenzweck klären", "BetrVG-Aufgabe, notwendige Daten und betroffene Personen dokumentieren."), step("minimierung", "Datenumfang begrenzen", "Nicht erforderliche Details entfernen oder pseudonymisieren."), step("zugriff", "Zugriffe festlegen", "Rollen, Vertraulichkeit, Übermittlung und technische Sicherung definieren."), step("aufbewahrung", "Löschung und Aufbewahrung regeln", "Wiedervorlage, Löschereignis und rechtliche Dokumentationsbedarfe festhalten."), step("vorfall", "Datenpannenweg festlegen", "Meldung, Eindämmung, Dokumentation und Zusammenarbeit mit Arbeitgeber/Datenschutzbeauftragten klären."), step("review", "Regelmäßig überprüfen", "Berechtigungen, Altbestände und Verfahren wiederkehrend kontrollieren.")],
  },
  {
    id: "personalfragebogen-richtlinie", title: "Personalfragebogen oder Beurteilungsgrundsatz", group: "Personal", category: "personelle_massnahme", riskLevel: "hoch",
    situation: "Fragebögen, Beurteilungskriterien oder Auswahlrichtlinien sollen eingeführt oder geändert werden.",
    plainLanguage: "Fragen und Kriterien prägen Personalentscheidungen. Der Betriebsrat prüft Erforderlichkeit, Fairness, Transparenz, Datenschutz und mögliche Diskriminierung.",
    firstQuestion: "Welche Entscheidung wird mit welchen Fragen oder Kriterien vorbereitet?",
    legalSections: ["94", "95", "75", "79a"], deadlineNote: noFixedDeadline,
    steps: [step("material", "Vollständige Unterlagen sichern", "Fragebogen, Kriterien, Gewichtung, Auswertung und Empfängerkreis anfordern."), step("zweck", "Zweck und Erforderlichkeit prüfen", "Jede Frage und jedes Kriterium einer legitimen Aufgabe zuordnen."), step("fairness", "Fairness und Risiken prüfen", "Diskriminierung, subjektive Wertung und intransparente Automatisierung untersuchen."), step("regeln", "Änderungen und Schutzregeln verhandeln", "Streichungen, Erläuterungen, Beteiligung und Korrekturrechte festlegen."), step("abschluss", "Zustimmung dokumentieren", "Verbindliche Fassung beschließen und spätere Änderungen kontrollieren.")],
  },
  {
    id: "personalplanung-beschaeftigung", title: "Personalplanung und Beschäftigungssicherung", group: "Wirtschaft", category: "personalplanung", riskLevel: "hoch",
    situation: "Personalbedarf, Abbau, Qualifikation oder Maßnahmen zur Beschäftigungssicherung werden beraten.",
    plainLanguage: "Der Betriebsrat verlangt nachvollziehbare Planung, entwickelt Alternativen und macht Vorschläge zur Sicherung und Förderung von Beschäftigung.",
    firstQuestion: "Wie entwickeln sich Aufgaben, Stellen, Qualifikationen und Beschäftigungsformen in den nächsten Monaten?",
    legalSections: ["92", "92a", "96", "97"], deadlineNote: noFixedDeadline,
    steps: [step("daten", "Planungsdaten anfordern", "Soll/Ist, Fluktuation, Befristung, Leiharbeit, Qualifikation und Szenarien erfassen."), step("luecken", "Risiken und Bedarfe analysieren", "Unterbesetzung, Überlastung, Abbau, Qualifikationslücken und vulnerable Gruppen betrachten."), step("vorschlag", "Eigene Vorschläge entwickeln", "Arbeitszeit, Qualifizierung, Insourcing, Versetzung und Prozessverbesserung prüfen."), step("beratung", "Mit Arbeitgeber beraten", "Begründete Antworten und Entscheidungen zu Vorschlägen dokumentieren."), step("monitoring", "Plan gegen Wirklichkeit prüfen", "Kennzahlen und Maßnahmen regelmäßig nachhalten.")],
  },
];

const byId = new Map(betrvg.provisions.map(provision => [provision.id, provision]));

export function findProvision(id: string): LegalProvision | undefined {
  return byId.get(id.replace(/^§\s*/, "").trim());
}

export function getProcedureTemplate(id: string): ProcedureTemplate | undefined {
  return procedureTemplates.find(template => template.id === id);
}

export function provisionSummary(provision: LegalProvision): string {
  if (/aufgehobene vorschrift/i.test(provision.title) || /weggefallen/i.test(provision.text)) return "Diese Vorschrift ist weggefallen; sie bleibt zur vollständigen Abbildung des Gesetzes sichtbar.";
  const first = provision.text.replace(/\s+/g, " ").replace(/^\(\d+\)\s*/, "");
  return first.length > 230 ? `${first.slice(0, 227).trim()}…` : first;
}

export function searchProvisions(query: string, chapter = ""): LegalProvision[] {
  const needle = normalise(query.trim());
  return betrvg.provisions.filter(provision => {
    if (chapter && provision.chapter !== chapter) return false;
    if (!needle) return true;
    return normalise(`${provision.citation} ${provision.title} ${provision.chapter} ${provision.text}`).includes(needle);
  });
}

export interface LegalSuggestion { provision: LegalProvision; reason: string }

const entityDefaults: Record<string, Array<[string, string]>> = {
  case: [["80", "Allgemeine Aufgaben und Informationsrechte des Betriebsrats"]],
  task: [["80", "Aufgaben des Betriebsrats als rechtlicher Ausgangspunkt"]],
  inquiry: [["84", "Beschwerderecht von Beschäftigten"], ["85", "Behandlung von Beschwerden durch den Betriebsrat"], ["79", "Schutz vertraulicher Informationen"]],
  agreement: [["77", "Durchführung und Wirkung von Betriebsvereinbarungen"], ["87", "Zentrale Mitbestimmungstatbestände"], ["88", "Mögliche freiwillige Betriebsvereinbarungen"]],
  decision: [["33", "Voraussetzungen der Beschlussfassung"], ["34", "Anforderungen an die Sitzungsniederschrift"]],
  document: [["79", "Geheimhaltungspflichten"], ["79a", "Datenschutz in der Betriebsratsarbeit"]],
  meeting: [["29", "Einberufung der Sitzung"], ["30", "Durchführung der Betriebsratssitzung"], ["33", "Beschlussfassung"], ["34", "Sitzungsniederschrift"]],
  training: [["37", "Arbeitsbefreiung und erforderliche Schulungen"], ["40", "Kosten und Sachaufwand des Betriebsrats"]],
  member: [["37", "Ehrenamt, Arbeitsbefreiung und Schulung"], ["78", "Schutz vor Behinderung und Benachteiligung"]],
  committee: [["27", "Betriebsausschuss"], ["28", "Weitere Ausschüsse und Aufgabenübertragung"]],
};

const keywordRules: Array<{ terms: string[]; provisions: string[]; reason: string }> = [
  { terms: ["kundig", "entlass"], provisions: ["102"], reason: "Anhörung des Betriebsrats vor Kündigungen" },
  { terms: ["einstell", "versetz", "umgrupp", "eingrupp", "personelle"], provisions: ["99", "100", "101"], reason: "Beteiligung bei personellen Einzelmaßnahmen" },
  { terms: ["software", "it ", "ki", "kunstliche intelligenz", "uberwach", "zeiterfass", "kamera", "tracking"], provisions: ["80", "87", "90", "95", "79a"], reason: "Mitbestimmung, Information und Datenschutz bei Technik" },
  { terms: ["arbeitszeit", "schicht", "dienstplan", "pause", "uberstund", "mehrarbeit", "urlaub"], provisions: ["87"], reason: "Mitbestimmung bei Arbeitszeit und Urlaubsgrundsätzen" },
  { terms: ["mobil", "homeoffice", "remote"], provisions: ["87", "90"], reason: "Ausgestaltung mobiler Arbeit und Arbeitsplanung" },
  { terms: ["gesund", "gefahr", "unfall", "belast", "arbeitsschutz"], provisions: ["87", "89", "90", "91"], reason: "Arbeits- und Gesundheitsschutz" },
  { terms: ["beschwer", "konflikt", "mobbing"], provisions: ["84", "85", "75"], reason: "Beschwerden, Schutz und Gleichbehandlung" },
  { terms: ["diskrimin", "gleichstell", "benachteilig"], provisions: ["75", "80"], reason: "Gleichbehandlung und Schutzaufgaben" },
  { terms: ["umstruktur", "betriebsander", "stillleg", "verlegung", "sozialplan", "interessenausgleich"], provisions: ["111", "112", "112a", "113"], reason: "Betriebsänderung, Interessenausgleich und Sozialplan" },
  { terms: ["wirtschaft", "invest", "kennzahl"], provisions: ["106", "107", "108", "109", "110"], reason: "Wirtschaftsausschuss und wirtschaftliche Angelegenheiten" },
  { terms: ["seminar", "schulung", "bildung", "qualifiz"], provisions: ["37", "96", "97", "98"], reason: "Schulungsanspruch und Berufsbildung" },
  { terms: ["datenschutz", "personenbezogen", "vertraulich", "geheim"], provisions: ["79", "79a", "80"], reason: "Vertraulichkeit und Datenschutz" },
  { terms: ["wahl", "wahlvorstand"], provisions: ["13", "14", "14a", "16", "17", "18", "19", "20"], reason: "Betriebsratswahl und Wahlverfahren" },
  { terms: ["fragebogen", "beurteilung", "auswahlrichtlinie"], provisions: ["94", "95"], reason: "Personalfragebögen und Auswahlrichtlinien" },
];

export function suggestLegalSections(entityType: string, context: string): LegalSuggestion[] {
  const results = new Map<string, LegalSuggestion>();
  const add = (id: string, reason: string) => { const provision = findProvision(id); if (provision && !results.has(id)) results.set(id, { provision, reason }); };
  for (const [id, reason] of entityDefaults[entityType] ?? []) add(id, reason);
  const haystack = normalise(context);
  for (const rule of keywordRules) if (rule.terms.some(term => haystack.includes(normalise(term)))) for (const id of rule.provisions) add(id, rule.reason);
  return [...results.values()].slice(0, 14);
}
