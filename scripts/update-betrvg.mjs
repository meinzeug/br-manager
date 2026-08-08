import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sourceUrl="https://www.gesetze-im-internet.de/betrvg/xml.zip";
const output=path.resolve("src/data/betrvg.json");
const temporary=mkdtempSync(path.join(tmpdir(),"br-manager-betrvg-"));

function decode(value){
  const entities={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "};
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(_match,key)=>{if(key[0]==="#"){const hex=key[1]?.toLowerCase()==="x";return String.fromCodePoint(Number.parseInt(key.slice(hex?2:1),hex?16:10));}return entities[key.toLowerCase()]??`&${key};`;});
}
function extract(block,tag){const match=block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,"i"));return match?plain(match[1]):"";}
function plain(value){
  return decode(value.replace(/<BR\s*\/?\s*>/gi,"\n").replace(/<\/P>/gi,"\n\n").replace(/<P\b[^>]*>/gi,"").replace(/<DT\b[^>]*>/gi,"\n").replace(/<\/DT>/gi," ").replace(/<DD\b[^>]*>/gi,"").replace(/<\/DD>/gi,"\n").replace(/<LA\b[^>]*>/gi,"").replace(/<\/LA>/gi,"\n").replace(/<entry\b[^>]*>/gi,"\n").replace(/<\/entry>/gi," ").replace(/<row\b[^>]*>/gi,"\n").replace(/<\/row>/gi,"\n").replace(/<[^>]+>/g,""))
    .replace(/\u00a0/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim();
}

try{
  const response=await fetch(sourceUrl);if(!response.ok)throw new Error(`Download fehlgeschlagen: ${response.status}`);
  const archive=path.join(temporary,"betrvg.zip");writeFileSync(archive,Buffer.from(await response.arrayBuffer()));
  execFileSync("unzip",["-q",archive,"-d",temporary]);
  const xml=readFileSync(path.join(temporary,"BJNR000130972.xml"),"utf8"),documentMeta=xml.match(/<dokumente\b([^>]*)>/)?.[1]??"",buildDate=documentMeta.match(/builddate="(\d{14})"/)?.[1]??"";
  const versionNotes=[...xml.matchAll(/<standkommentar\b[^>]*>([\s\S]*?)<\/standkommentar>/gi)].map(match=>plain(match[1]));
  const versionNote=versionNotes.find(note=>/^Zuletzt geändert/i.test(note))??versionNotes.at(-1)??"Versionsstand siehe amtliche Quelle";
  const provisions=[],hierarchy=[];
  for(const block of xml.match(/<norm\b[\s\S]*?<\/norm>/g)??[]){
    const groupingKey=extract(block,"gliederungskennzahl");
    if(groupingKey){const groupingTitle=extract(block,"gliederungstitel"),groupingLabel=extract(block,"gliederungsbez"),level=groupingKey.length;while(hierarchy.length&&hierarchy.at(-1).level>=level)hierarchy.pop();hierarchy.push({level,text:[groupingLabel,groupingTitle].filter(Boolean).join(" – ")});continue;}
    const citation=extract(block,"enbez");if(!/^§\s/.test(citation))continue;
    const id=citation.replace(/^§\s*/,"").trim(),title=extract(block,"titel")||"Aufgehobene Vorschrift",contentMatch=block.match(/<text\b[^>]*>[\s\S]*?<Content>([\s\S]*?)<\/Content>/i),text=contentMatch?plain(contentMatch[1]):"";
    provisions.push({id,citation,title,chapter:hierarchy.map(item=>item.text).filter(Boolean).join(" · "),text:text||"(weggefallen)",sourceUrl:`https://www.gesetze-im-internet.de/betrvg/__${id}.html`});
  }
  const payload={law:"Betriebsverfassungsgesetz",abbreviation:"BetrVG",source:"Bundesministerium der Justiz / Bundesamt für Justiz – Gesetze im Internet",sourceUrl:"https://www.gesetze-im-internet.de/betrvg/",sourceXml:sourceUrl,buildDate,versionNote,retrievedAt:new Date().toISOString(),provisions};
  mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,`${JSON.stringify(payload,null,2)}\n`);
  console.log(`${provisions.length} BetrVG-Vorschriften nach ${output} geschrieben.`);
}finally{rmSync(temporary,{recursive:true,force:true});}
