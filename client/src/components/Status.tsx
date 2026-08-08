import { Badge } from "./UI";

const labels:Record<string,string>={
  neu:"Neu",in_pruefung:"In Prüfung",verhandlung:"Verhandlung",beschlossen:"Beschlossen",erledigt:"Erledigt",archiviert:"Archiviert",
  offen:"Offen",in_arbeit:"In Arbeit",wartet:"Wartet",entwurf:"Entwurf",geplant:"Geplant",eingeladen:"Eingeladen",laufend:"Laufend",abgeschlossen:"Abgeschlossen",abgesagt:"Abgesagt",
  in_bearbeitung:"In Bearbeitung",rueckfrage:"Rückfrage",gueltig:"Gültig",gekuendigt:"Gekündigt",ausgelaufen:"Ausgelaufen",
  angenommen:"Angenommen",abgelehnt:"Abgelehnt",nicht_beschlussfaehig:"Nicht beschlussfähig",zur_pruefung:"Zur Prüfung",freigegeben:"Freigegeben",unterzeichnet:"Unterzeichnet",
  bedarf:"Bedarf",beantragt:"Beantragt",gebucht:"Gebucht",niedrig:"Niedrig",normal:"Normal",hoch:"Hoch",kritisch:"Kritisch",
};
export function label(value:unknown):string{const key=String(value??"");return labels[key]||key.replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());}
export function Status({value}:{value:unknown}){return <Badge tone={String(value)}>{label(value)}</Badge>}
