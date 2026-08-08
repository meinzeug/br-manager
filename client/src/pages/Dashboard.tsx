import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, Check, ClipboardCheck, FileClock, FolderLock, Inbox, Scale, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api, dateTime, patch, type Row } from "../api";
import { ErrorBox, PageHeader, Panel, Spinner } from "../components/UI";
import { Status } from "../components/Status";
import { useAuth } from "../AuthContext";

interface DashboardData { stats:Record<string,number>;meetings:Row[];deadlines:Row[];myTasks:Row[];activity:Row[] }

export default function Dashboard(){
  const {user,permissions}=useAuth(),[data,setData]=useState<DashboardData|null>(null),[error,setError]=useState("");
  useEffect(()=>{api<DashboardData>("/dashboard").then(setData).catch(reason=>setError(reason instanceof Error?reason.message:"Dashboard konnte nicht geladen werden."));},[]);
  if(error)return <ErrorBox message={error}/>;
  if(!data)return <Spinner/>;
  const stats=[
    ["Offene Vorgänge",data.stats.openCases,"/vorgaenge",Scale,"teal"],
    ["Fristen ≤ 7 Tage",data.stats.dueSoon,"/vorgaenge",FileClock,"amber"],
    ["Offene Aufgaben",data.stats.openTasks,"/aufgaben",ClipboardCheck,"blue"],
    ["Mitarbeiteranfragen",data.stats.openInquiries,"/anfragen",Inbox,"rose"],
    ["Aktive Vereinbarungen",data.stats.activeAgreements,"/vereinbarungen",FolderLock,"purple"],
  ] as const;
  return <>
    <PageHeader eyebrow="Arbeitszentrale" title={`Guten Tag, ${user?.firstName}.`} description="Alle Fristen, Sitzungen und offenen Themen des Gremiums auf einen Blick." action={<Link className={`overdue-indicator ${data.stats.overdue?"alert":"clear"}`} to="/aufgaben?filter=overdue"><span>{data.stats.overdue?<AlertTriangle/>:<Check/>}</span><div><strong>{data.stats.overdue||"Alles"}</strong><small>{data.stats.overdue===1?"überfälliger Eintrag":data.stats.overdue?"überfällige Einträge":"im Plan"}</small></div></Link>}/>
    <section className="novice-start"><div><span><Sparkles/></span><div><small>Ohne juristische Vorkenntnisse starten</small><strong>Was ist passiert? Die Software führt Sie Schritt für Schritt.</strong><p>Wählen Sie einen typischen Fall in Alltagssprache. Passende Rechtsgrundlagen, Prüffragen und Aufgaben werden automatisch vorbereitet.</p></div></div><div><Link className="button primary" to="/vorgaenge?assistant=1"><Sparkles/>Fall auswählen</Link><Link className="button secondary" to="/rechtswissen"><BookOpen/>Rechtswissen durchsuchen</Link></div></section>
    <div className="stat-grid">{stats.map(([title,value,url,Icon,tone])=><Link to={url} className={`stat-card ${tone}`} key={title}><span className="stat-icon"><Icon/></span><strong>{value}</strong><span>{title}</span><ArrowRight className="stat-arrow"/></Link>)}</div>
    <div className="dashboard-grid dashboard-triple">
      <Panel title="Nächste Sitzungen" action={<Link to="/sitzungen">Alle Sitzungen</Link>}><div className="stack-list">{data.meetings.map(meeting=><Link className="stack-item" to={`/sitzungen/${meeting.id}`} key={String(meeting.id)}><div className="date-tile"><b>{new Date(String(meeting.starts_at)).toLocaleDateString("de-DE",{day:"2-digit"})}</b><span>{new Date(String(meeting.starts_at)).toLocaleDateString("de-DE",{month:"short"})}</span></div><div><strong>{meeting.title}</strong><span>{dateTime(meeting.starts_at)} · {meeting.location||"Ort offen"}</span></div><Status value={meeting.status}/></Link>)}{!data.meetings.length&&<div className="mini-empty"><CalendarDays/>Keine Sitzung geplant.</div>}</div></Panel>
      <Panel title="Anstehende Fristen" action={<Link to="/aufgaben?filter=overdue">Alle öffnen</Link>}><div className="deadline-list">{data.deadlines.map(deadline=><Link className="deadline" to={deadline.entity_type==="case"?`/vorgaenge?open=${deadline.id}`:`/aufgaben?open=${deadline.id}`} key={String(deadline.id)}><AlertTriangle/><div><strong>{deadline.reference&&`${deadline.reference} · `}{deadline.title}</strong><span>Fällig {dateTime(deadline.due_at)}</span></div><Status value={deadline.priority}/></Link>)}{!data.deadlines.length&&<div className="mini-empty"><ClipboardCheck/>Aktuell keine Fristen.</div>}</div></Panel>
      <Panel title="Mein Fokus" action={<Link to="/aufgaben?filter=mine">Zum Board</Link>}><div className="focus-list">{data.myTasks.map(task=><div className="focus-task" key={String(task.id)}><Link to={`/aufgaben?open=${task.id}`}><span><strong>{task.title}</strong><small>{task.case_reference||dateTime(task.due_at)}</small></span><Status value={task.priority}/></Link>{permissions?.includes("tasks:write")&&<button title="Aufgabe erledigen" onClick={async()=>{await patch(`/tasks/${task.id}`,{status:"erledigt"});setData(current=>current?{...current,stats:{...current.stats,openTasks:Math.max(0,(current.stats.openTasks??0)-1)},myTasks:current.myTasks.filter(item=>item.id!==task.id)}:current);}}><Check/></button>}</div>)}{!data.myTasks.length&&<div className="mini-empty"><Check/>Ihre persönliche Liste ist erledigt.</div>}</div></Panel>
    </div>
    <Panel title="Letzte Aktivitäten" className="activity-panel"><div className="activity-strip">{data.activity.map(activity=><div key={String(activity.id)}><span className="activity-dot"/><strong>{String(activity.action).replaceAll("_"," ")}</strong><span>{activity.first_name||"System"} {activity.last_name||""}</span><time>{dateTime(activity.created_at)}</time></div>)}</div></Panel>
  </>;
}
