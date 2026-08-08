# Rechtsquellen und Aktualisierung

Stand der eingebetteten Ausgabe: 8. August 2026.

BR Manager enthält alle 148 in der amtlichen XML-Ausgabe geführten Vorschriften des Betriebsverfassungsgesetzes einschließlich Buchstabenparagraphen und weggefallener Vorschriften. Dadurch bleiben Gesetzesaufbau, Suche und Verweise vollständig. Die Anwendung zeigt zu jeder Vorschrift den amtlichen Volltext, eine knappe Orientierung und einen direkten Link zur Quelle.

## Amtliche Quelle

- Gesetzesübersicht: [Betriebsverfassungsgesetz bei Gesetze im Internet](https://www.gesetze-im-internet.de/betrvg/)
- Amtliche PDF-Ausgabe: [BetrVG als PDF](https://www.gesetze-im-internet.de/betrvg/BetrVG.pdf)
- Maschinenlesbare Fassung: [Amtliches XML-Paket](https://www.gesetze-im-internet.de/betrvg/xml.zip)
- Im Datensatz vermerkter Versionsstand: „Zuletzt geändert durch Art. 1 G v. 19.7.2024 I Nr. 248“
- Build-Datum des am 8. August 2026 abgerufenen XML-Pakets: `20260713215501`

Die Originalquelle wird in `src/data/betrvg.json` zusammen mit Abrufzeit, Versionshinweis und URL gespeichert. Fremde Kommentierungen, Leitsätze oder urheberrechtlich geschützte Fachtexte werden nicht eingebettet.

## Aktualisieren

Voraussetzungen sind Node.js, `curl` und `unzip`. Im Repository ausführen:

```bash
node scripts/update-betrvg.mjs
npm run typecheck
npm test
npm run build
```

Das Aktualisierungsskript lädt ausschließlich das amtliche XML-Paket, extrahiert Paragraph, Überschrift, Gliederung und Text und ersetzt anschließend den generierten Datensatz. Änderungen an Anzahl, IDs oder Überschriften sollten im Review bewusst geprüft werden.

## Fachliche Grenze

Klartext-Einordnungen, Themenvorschläge, Standardverfahren, Checklisten und Fristberechnungen sind organisatorische Arbeitshilfen. Sie treffen keine Rechtsentscheidung und ersetzen keine Beratung durch Gewerkschaft, Rechtsanwältin/Rechtsanwalt oder eine andere fachkundige Stelle. Insbesondere sind Zugang, Fristbeginn, Fristende, Tarifbindung, Wahlordnung, aktuelle Rechtsprechung und der konkrete Sachverhalt gesondert zu prüfen.
