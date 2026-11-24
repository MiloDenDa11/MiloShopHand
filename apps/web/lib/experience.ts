"use client";
export const measurementConsentKey='milo-experience-consent:v1';
export function allowsMeasurement(){try{return localStorage.getItem(measurementConsentKey)==='yes'&&navigator.doNotTrack!=='1'&&!(navigator as any).globalPrivacyControl;}catch{return false;}}
export async function sendMeasurement(path:string,body:any){
  if(!allowsMeasurement())return;
  try{let token=decodeURIComponent(document.cookie.split('; ').find(value=>value.startsWith('milo_csrf='))?.slice(10)||'');if(!token){const r=await fetch('/api/v1/auth/csrf',{credentials:'same-origin'});token=(await r.json()).token;}
    if(!allowsMeasurement())return;
    await fetch(`/api/v1/experience/${path}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({consent:true,...body}),keepalive:true});
  }catch{/* Measurement never blocks shopping. */}
}
export function trackExperience(event:'VIEW_PRODUCT'|'SELECT_VARIANT'|'ADD_TO_CART'|'BEGIN_CHECKOUT',productId?:string){if(allowsMeasurement())void sendMeasurement('events',{events:[{id:crypto.randomUUID(),event,...(productId?{productId}:{})}]});}
