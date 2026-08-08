import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setCsrf, type AuthState } from "./api";

interface AuthContextValue extends Partial<AuthState>{loading:boolean;login:(email:string,password:string,totpCode?:string)=>Promise<void>;logout:()=>Promise<void>;refresh:()=>Promise<void>}
const AuthContext=createContext<AuthContextValue>({loading:true,login:async()=>{},logout:async()=>{},refresh:async()=>{}});

export function AuthProvider({children}:{children:ReactNode}){
  const [state,setState]=useState<AuthState|null>(null),[loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{try{const value=await api<AuthState>("/auth/me");setCsrf(value.csrfToken);setState(value);}catch{setState(null);}finally{setLoading(false);}},[]);
  useEffect(()=>{void refresh();},[refresh]);
  const login=async(email:string,password:string,totpCode="")=>{const value=await api<AuthState>("/auth/login",{method:"POST",body:JSON.stringify({email,password,totpCode})});setCsrf(value.csrfToken);setState(value);};
  const logout=async()=>{await api("/auth/logout",{method:"POST"});setCsrf("");setState(null);};
  return <AuthContext.Provider value={{...state,loading,login,logout,refresh}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
