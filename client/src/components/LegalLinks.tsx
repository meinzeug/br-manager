import { useCallback, useEffect, useState } from "react";
import { BookOpen, ExternalLink, Lightbulb, Plus, Scale, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api, post, type Row } from "../api";
import { useAuth } from "../AuthContext";
import type { EntityType } from "./Connections";
import { Button, ErrorBox, Modal, Spinner } from "./UI";

function ProvisionPicker({ entityType, entityId, onDone }: { entityType: EntityType; entityId: string; onDone: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ items: Row[] }>(`/legal/provisions?q=${encodeURIComponent(query)}`);
        setItems(data.items);
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Vorschriften konnten nicht geladen werden.");
      } finally { setLoading(false); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <div className="legal-picker">
    <div className="search-input"><BookOpen/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="z. B. Kündigung, Arbeitszeit oder § 87"/></div>
    <p>Sie müssen den Paragraphen nicht kennen: Suchen Sie einfach nach dem Thema.</p>
    {error && <ErrorBox message={error}/>} {loading ? <Spinner/> : <div className="legal-picker-list">{items.slice(0, 60).map(item => <label key={String(item.id)}>
      <input type="checkbox" checked={selected.includes(String(item.id))} onChange={event => setSelected(current => event.target.checked ? [...current, String(item.id)] : current.filter(id => id !== String(item.id)))}/>
      <span><strong>{item.citation} · {item.title}</strong><small>{item.plainSummary}</small></span>
    </label>)}</div>}
    <footer className="form-actions"><Button disabled={!selected.length} icon={<Scale/>} onClick={async () => { await post("/legal/links", { entityType, entityId, provisionIds: selected }); await onDone(); }}>Auswahl zuordnen</Button></footer>
  </div>;
}

export function LegalLinks({ entityType, entityId, className = "" }: { entityType: EntityType; entityId: string; className?: string }) {
  const { permissions } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [suggestions, setSuggestions] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const canWrite = permissions?.includes("links:write");
  const load = useCallback(async () => {
    try {
      const [linked, suggested] = await Promise.all([
        api<{ items: Row[] }>(`/legal/links/${entityType}/${entityId}`),
        api<{ items: Row[] }>(`/legal/suggestions/${entityType}/${entityId}`),
      ]);
      setItems(linked.items); setSuggestions(suggested.items); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rechtsgrundlagen konnten nicht geladen werden."); }
  }, [entityId, entityType]);
  useEffect(() => { void load(); }, [load]);
  const attach = async (id: string) => { await post("/legal/links", { entityType, entityId, provisionIds: [id] }); await load(); };
  return <>
    <section className={`detail-section legal-links ${className}`}>
      <header><div><h3>Rechtsgrundlagen – verständlich zugeordnet</h3><small>{items.length ? `${items.length} Vorschriften mit amtlichem Volltext` : "Passende Vorschriften werden aus dem Inhalt vorgeschlagen"}</small></div>{canWrite && <Button variant="ghost" icon={<Plus/>} onClick={() => setPickerOpen(true)}>Weitere</Button>}</header>
      {error && <div className="connection-error"><ErrorBox message={error}/></div>}
      <div className="legal-linked-list">{items.map(item => <div className="legal-linked-card" key={String(item.linkId)}>
        <Link to={`/rechtswissen?open=${item.id}`}><span><Scale/></span><div><strong>{item.citation} · {item.title}</strong><small>{item.plainSummary}</small></div><ExternalLink/></Link>
        {canWrite && <button className="icon-button" title="Zuordnung entfernen" onClick={async () => { await api(`/legal/links/${item.linkId}`, { method: "DELETE" }); await load(); }}><Trash2/></button>}
      </div>)}</div>
      {canWrite && suggestions.length > 0 && <div className="legal-suggestions"><div className="legal-suggestion-title"><Lightbulb/><span><strong>Das könnte passen</strong><small>Automatisch aus Thema und Datensatzart abgeleitet</small></span></div>{suggestions.slice(0, 5).map(item => <button key={String(item.id)} onClick={() => void attach(String(item.id))}><span><b>{item.citation}</b><small>{item.reason}</small></span><Plus/></button>)}</div>}
      {!items.length && !suggestions.length && !error && <div className="connection-empty"><BookOpen/><div><strong>Noch keine Rechtsgrundlage zugeordnet</strong><span>Nach Titel und Inhalt wurden keine eindeutigen Vorschläge gefunden. Suchen Sie einfach nach dem Alltagsthema.</span></div></div>}
      <div className="legal-disclaimer">Orientierungshilfe, keine Rechtsberatung. Fristen und Einzelfall fachkundig prüfen.</div>
    </section>
    <Modal title="BetrVG-Vorschriften zuordnen" open={pickerOpen} onClose={() => setPickerOpen(false)} wide><ProvisionPicker entityType={entityType} entityId={entityId} onDone={async () => { setPickerOpen(false); await load(); }}/></Modal>
  </>;
}
