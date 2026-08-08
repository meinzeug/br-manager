export interface User {
  id:string;councilId:string;councilName:string;email:string;firstName:string;lastName:string;
  role:"admin"|"vorsitz"|"sekretariat"|"mitglied"|"ersatzmitglied"|"lesezugriff";
  mustChangePassword:boolean;
  twoFactorEnabled:boolean;
}
export interface AuthState {user:User;permissions:string[];csrfToken:string}
export type Row=Record<string,string|number|boolean|null|undefined>;

let csrfToken="";
export function setCsrf(value:string){csrfToken=value;}

export async function api<T=unknown>(url:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);
  if(options.body && !(options.body instanceof FormData))headers.set("Content-Type","application/json");
  if(options.method && !["GET","HEAD"].includes(options.method.toUpperCase()))headers.set("X-CSRF-Token",csrfToken);
  const response=await fetch(`/api${url}`,{...options,headers,credentials:"same-origin"});
  if(!response.ok){let message=`Fehler ${response.status}`;try{const body=await response.json() as {error?:string};message=body.error||message;}catch{/* response is not JSON */}throw new Error(message);}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}

export function post<T=unknown>(url:string,data:unknown):Promise<T>{return api<T>(url,{method:"POST",body:JSON.stringify(data)});}
export function patch<T=unknown>(url:string,data:unknown):Promise<T>{return api<T>(url,{method:"PATCH",body:JSON.stringify(data)});}

export function dateTime(value:unknown):string{
  if(!value)return "—";const date=new Date(String(value));return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(date);
}
export function dateOnly(value:unknown):string{
  if(!value)return "—";const date=new Date(String(value));return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat("de-DE",{dateStyle:"medium"}).format(date);
}
export function euro(cents:unknown):string{return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(cents||0)/100);}
