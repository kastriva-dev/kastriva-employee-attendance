"use client";
import {useEffect} from "react";
export default function PwaRegister(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    let registration:ServiceWorkerRegistration|undefined;
    navigator.serviceWorker.register("/sw.js").then(r=>{registration=r;});
    const onMessage=(event:MessageEvent)=>{if(event.data?.type==="APP_UPDATE_READY")window.dispatchEvent(new Event("pwa-update-ready"));};
    navigator.serviceWorker.addEventListener("message",onMessage);
    return()=>{navigator.serviceWorker.removeEventListener("message",onMessage);};
  },[]);
  return null;
}
