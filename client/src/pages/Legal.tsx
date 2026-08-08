import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, ExternalLink, GraduationCap, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Row } from "../api";
import { Badge, Button, Drawer, ErrorBox, PageHeader, Panel, Spinner } from "../components/UI";

interface LegalMeta { law:string;abbreviation:string;source:string;sourceUrl:string;versionNote:string;buildDate:string;retrievedAt:string;count:number;chapters:string[];disclaimer:string }

export default function LegalPage() {
  const [meta, setMeta] = useState<LegalMeta | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const open = params.get("open");
  useEffect(() => {
    Promise.all([api<LegalMeta>("/legal/meta"), api<{ items: Row[] }>("/legal/provisions")])
      .then(([metadata, provisions]) => { setMeta(metadata); setItems(provisions.items); setError(""); })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Rechtswissen konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!open) { setSelected(null); return; }
    api<{ item: Row }>(`/legal/provisions/${encodeURIComponent(open)}`).then(data => setSelected(data.item)).catch(reason => setError(reason instanceof Error ? reason.message : "Vorschrift konnte nicht geladen werden."));
  }, [open]);
  const filtered = useMemo(() => {
    const needle = query.toLocaleLowerCase("de-DE");
    return items.filter(item => (!chapter || item.chapter === chapter) && (!needle || `${item.citation} ${item.title} ${item.plainSummary}`.toLocaleLowerCase("de-DE").includes(needle)));
  }, [chapter, items, query]);
  const select = (id: unknown) => { const next = new URLSearchParams(params); next.set("open", String(id)); setParams(next); };
  const close = () => { const next = new URLSearchParams(params); next.delete("open"); setParams(next, { replace: true }); };
  return <>
    <PageHeader eyebrow="BetrVG · verständlich erschlossen" title="Rechtswissen" description="Suchen Sie nach einem Alltagsthema. Sie müssen weder Paragraphen noch juristische Fachwörter kennen." action={<Link className="button primary" to="/vorgaenge?assistant=1"><Sparkles/>Geführten Fall starten</Link>}/>
    <div className="legal-guide-strip">
      <span><GraduationCap/></span><div><strong>Rechtliches Vorwissen ist nicht erforderlich.</strong><p>Die Software erklärt den nächsten Arbeitsschritt in Klartext, zeigt die amtliche Grundlage und kennzeichnet, was im Einzelfall zusätzlich geprüft werden muss.</p></div>
      <ShieldCheck/><small>Orientierungshilfe<br/>keine Rechtsberatung</small>
    </div>
    {error && <ErrorBox message={error}/>} {loading ? <Spinner/> : <div className="legal-layout">
      <aside className="legal-chapters"><strong>Themen im Gesetz</strong><button className={!chapter ? "active" : ""} onClick={() => setChapter("")}><span>Alle Vorschriften</span><b>{meta?.count}</b></button>{meta?.chapters.map(name => <button className={chapter === name ? "active" : ""} onClick={() => setChapter(name)} key={name}><span>{name.replaceAll("\n", " ")}</span><ArrowRight/></button>)}</aside>
      <Panel className="legal-browser">
        <div className="legal-browser-head"><div className="search-input"><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Thema eingeben: Kündigung, Dienstplan, KI, Beschwerde …"/></div><span>{filtered.length} von {meta?.count} Vorschriften</span></div>
        <div className="legal-grid">{filtered.map(item => <button className="legal-provision-card" onClick={() => select(item.id)} key={String(item.id)}><span className="legal-citation">{item.citation}</span><div><small>{String(item.chapter).split("·").at(-1)}</small><strong>{item.title}</strong><p>{item.plainSummary}</p></div><ArrowRight/></button>)}</div>
        {!filtered.length && <div className="legal-no-results"><BookOpen/><strong>Kein direkter Treffer</strong><p>Probieren Sie einen allgemeineren Begriff oder wählen Sie „Alle Vorschriften“.</p></div>}
      </Panel>
    </div>}
    <Drawer open={Boolean(open)} onClose={close} title={String(selected?.title || "Vorschrift wird geladen …")} eyebrow={selected ? `${selected.citation} BetrVG` : "Amtlicher Volltext"} actions={selected ? <><Button variant="secondary" icon={<ExternalLink/>} onClick={() => window.open(String(selected.sourceUrl), "_blank", "noopener,noreferrer")}>Amtliche Quelle</Button><Link className="button primary" to={`/vorgaenge?assistant=1&topic=${encodeURIComponent(String(selected.title))}`}><Sparkles/>Passenden Fall starten</Link></> : undefined}>
      {!selected ? <Spinner/> : <>
        <section className="legal-plain-box"><span><Sparkles/></span><div><small>Einfach eingeordnet</small><strong>Worum geht es hier?</strong><p>{selected.plainSummary}</p></div></section>
        <section className="legal-source-note"><ShieldCheck/><div><strong>Amtlicher Gesetzestext</strong><span>{meta?.versionNote}. Quelle: {meta?.source}.</span></div></section>
        <article className="legal-fulltext"><h3>{selected.citation} · {selected.title}</h3><p>{selected.text}</p></article>
        <div className="legal-disclaimer page"><strong>Bitte beachten:</strong> Die Einordnung und Standardverfahren sind Arbeitshilfen, keine Rechtsberatung. Fristen, Tarifverträge, Wahlordnung, Rechtsprechung und Besonderheiten des Einzelfalls können zusätzliche Prüfungen erfordern.</div>
      </>}
    </Drawer>
  </>;
}
