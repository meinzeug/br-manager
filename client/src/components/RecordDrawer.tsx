import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, CheckCircle2, FileText, Link2, Pencil, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api, dateOnly, dateTime, patch, type Row } from "../api";
import { label, Status } from "./Status";
import { Button, Drawer, EntityForm, ErrorBox, Modal, Spinner, type FieldDef } from "./UI";
import { ConnectionsPanel, type EntityType } from "./Connections";
import { LegalLinks } from "./LegalLinks";

interface DetailResponse{item:Row;related:Record<string,Row[]>}
interface RecordDrawerProps{
  endpoint:string;selectedId:string|null;onClose:()=>void;fields:FieldDef[];eyebrow:string;
  titleKey?:string;referenceKey?:string;editPermission?:string;onUpdated?:()=>Promise<void>|void;
  readOnly?:boolean;renderFeature?:(item:Row,related:Record<string,Row[]>)=>ReactNode;
}

const snake=(value:string)=>value.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`);
function rawValue(row:Row,field:FieldDef):unknown{
  if(field.key==="costEuro")return Number(row.cost_cents||0)/100;
  return row[snake(field.key)]??row[field.key]??"";
}
function inputValue(row:Row,field:FieldDef):unknown{
  const value=rawValue(row,field);
  if(field.type==="checkbox")return Boolean(value);
  if(field.type==="date"&&value)return String(value).slice(0,10);
  if(field.type==="datetime-local"&&value){const date=new Date(String(value));return Number.isNaN(date.getTime())?String(value).slice(0,16):date.toISOString().slice(0,16);}
  return value;
}
function displayValue(row:Row,field:FieldDef):ReactNode{
  const value=rawValue(row,field);
  if(field.type==="checkbox")return value?"Ja":"Nein";
  if(field.type==="date")return dateOnly(value);
  if(field.type==="datetime-local")return dateTime(value);
  if(field.type==="select")return field.options?.find(option=>option.value===String(value))?.label||label(value)||"—";
  if(field.key==="costEuro")return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(value||0));
  return String(value||"—");
}
const relationConfig:Record<string,{title:string;path:(row:Row)=>string}>={
  cases:{title:"Vorgänge",path:row=>`/vorgaenge?open=${row.id}`},agreements:{title:"Vereinbarungen",path:row=>`/vereinbarungen?open=${row.id}`},
  tasks:{title:"Aufgaben",path:row=>`/aufgaben?open=${row.id}`},decisions:{title:"Beschlüsse",path:row=>`/beschluesse?open=${row.id}`},
  documents:{title:"Dokumente",path:row=>`/dokumente?open=${row.id}`},meetings:{title:"Sitzungen",path:row=>`/sitzungen/${row.id}`},
  committees:{title:"Gremien & Ausschüsse",path:row=>`/gremium?committee=${row.id}`},trainings:{title:"Seminare",path:row=>`/seminare?open=${row.id}`},
  members:{title:"Mitglieder",path:row=>`/gremium?member=${row.user_id||row.id}`},versions:{title:"Versionen",path:()=>"#"},
};
const typeByEndpoint:Record<string,EntityType>={"/cases":"case","/tasks":"task","/inquiries":"inquiry","/agreements":"agreement","/decisions":"decision","/documents":"document","/members":"member","/committees":"committee","/trainings":"training"};

export function RecordDrawer({endpoint,selectedId,onClose,fields,eyebrow,titleKey="title",referenceKey="reference",editPermission,onUpdated,readOnly=false,renderFeature}:RecordDrawerProps){
  const {permissions}=useAuth(),[data,setData]=useState<DetailResponse|null>(null),[error,setError]=useState(""),[editing,setEditing]=useState(false);
  const load=useCallback(async()=>{if(!selectedId)return;setError("");try{setData(await api<DetailResponse>(`${endpoint}/${selectedId}`));}catch(err){setError(err instanceof Error?err.message:"Details konnten nicht geladen werden.");}},[endpoint,selectedId]);
  useEffect(()=>{setData(null);setEditing(false);void load();},[load]);
  const item=data?.item;
  const initial=useMemo(()=>{const result:Record<string,unknown>={};if(item)for(const field of fields)result[field.key]=inputValue(item,field);return result;},[fields,item]);
  const canEdit=!readOnly&&(!editPermission||permissions?.includes(editPermission));
  const narrativeKeys=['description','summary','outcome','notes','resolutionText'];
  const narratives=item?fields.filter(field=>narrativeKeys.includes(field.key)&&rawValue(item,field)):[];
  const visibleFields=fields.filter(field=>field.key!==titleKey&&!narrativeKeys.includes(field.key));
  const actions=item?<>{canEdit&&<Button onClick={()=>setEditing(true)} icon={<Pencil/>}>Bearbeiten</Button>}<Button variant="secondary" onClick={()=>void load()} icon={<RefreshCw/>}>Aktualisieren</Button></>:undefined;
  return <><Drawer open={Boolean(selectedId)} onClose={onClose} title={String(item?.[titleKey]||"Details werden geladen …")} eyebrow={item?.[referenceKey]?`${eyebrow} · ${item[referenceKey]}`:eyebrow} actions={actions}>{error&&<ErrorBox message={error}/>} {!item&&!error&&<Spinner/>}{item&&<><div className="detail-hero">{item.status&&<Status value={item.status}/>} {item.priority&&<Status value={item.priority}/>} {item.confidentiality&&<Status value={item.confidentiality}/>}</div>{renderFeature?.(item,data.related)}{narratives.map(field=><section className="detail-narrative" key={field.key}><span>{field.label}</span><p>{String(rawValue(item,field))}</p></section>)}{typeByEndpoint[endpoint]&&<LegalLinks entityType={typeByEndpoint[endpoint]} entityId={String(item.id)}/>} {typeByEndpoint[endpoint]&&<ConnectionsPanel entityType={typeByEndpoint[endpoint]} entityId={String(item.id)}/>}<section className="detail-section"><header><h3>Stammdaten</h3><CheckCircle2/></header><div className="detail-grid">{visibleFields.map(field=><div className={`detail-field ${field.span===2||field.type==="textarea"?"wide":""}`} key={field.key}><span>{field.label}</span><strong>{displayValue(item,field)}</strong></div>)}</div></section>{Object.entries(data.related).filter(([,rows])=>rows.length>0).map(([key,rows])=>{const config=relationConfig[key];if(!config)return null;return <section className="detail-section" key={key}><header><h3>{config.title}</h3><span className="badge">{rows.length}</span></header><div className="detail-relations">{rows.map((row,index)=>key==="versions"?<div className="relation-card" key={String(row.id||index)}><span><FileText/></span><div><strong>Version {row.version} · {row.original_name}</strong><small>{dateTime(row.created_at)} · {(Number(row.size||0)/1024).toFixed(1)} KB</small></div></div>:<Link className="relation-card" to={config.path(row)} onClick={onClose} key={String(row.id||row.user_id||index)}><span><Link2/></span><div><strong>{row.reference&&`${row.reference} · `}{row.title||row.name||`${row.first_name} ${row.last_name}`}</strong><small>{row.status?label(row.status):row.kind?label(row.kind):dateTime(row.starts_at||row.created_at)}</small></div></Link>)}</div></section>})}<div className="detail-meta"><span><CalendarClock/>Erstellt {dateTime(item.created_at)}</span>{item.updated_at&&<span><RefreshCw/>Geändert {dateTime(item.updated_at)}</span>}</div></>}</Drawer>{item&&<Modal title={`${String(item[titleKey])} bearbeiten`} open={editing} onClose={()=>setEditing(false)} wide><EntityForm fields={fields} initial={initial} submitLabel="Änderungen speichern" onSubmit={async values=>{await patch(`${endpoint}/${selectedId}`,values);setEditing(false);await load();await onUpdated?.();}}/></Modal>}</>;
}
