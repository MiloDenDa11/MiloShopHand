"use client";
import {useEffect,useState} from 'react';
import {allowsMeasurement,measurementConsentKey,sendMeasurement} from '../lib/experience';
let registered=false;
export function ExperienceConsent(){
  const [choice,setChoice]=useState<string|null>(null),[show,setShow]=useState(false);
  useEffect(()=>{try{const value=localStorage.getItem(measurementConsentKey);setChoice(value);setShow(!value&&navigator.doNotTrack!=='1'&&!(navigator as any).globalPrivacyControl);}catch{setChoice('no');}},[]);
  useEffect(()=>{if(choice!=='yes'||!allowsMeasurement()||registered)return;registered=true;const path=location.pathname;const page=path==='/'?'HOME':path==='/san-pham'?'CATALOG':path.startsWith('/san-pham/')?'PRODUCT':path==='/thanh-toan'?'CHECKOUT':'OTHER';void import('web-vitals').then(({onLCP,onINP,onCLS})=>{const report=(metric:any)=>void sendMeasurement('performance',{id:crypto.randomUUID(),metric:metric.name,page,rating:metric.rating});onLCP(report);onINP(report);onCLS(report);});},[choice]);
  function choose(value:string){try{localStorage.setItem(measurementConsentKey,value);}catch{}setChoice(value);setShow(false);window.dispatchEvent(new Event('milo:measurement-consent'));}
  return <><button type="button" className="measurement-settings" onClick={()=>setShow(true)}>Tùy chọn đo trải nghiệm</button>{show&&<aside className="experience-consent" aria-label="Lựa chọn đo trải nghiệm"><h2>Giúp Milo phục vụ tốt hơn.</h2><p>Milo có thể đếm thao tác mua hàng và đo tốc độ trang. Không gửi tên, email, ảnh cá nhân hoặc thông tin thanh toán; không dùng dịch vụ quảng cáo bên ngoài.</p><div className="row"><button type="button" className="button secondary" onClick={()=>choose('no')}>Từ chối</button><button type="button" className="button" onClick={()=>choose('yes')}>Đồng ý đo trải nghiệm</button></div><p className="small muted">Bạn có thể thay đổi lựa chọn bất cứ lúc nào. Website vẫn hoạt động khi từ chối.</p></aside>}</>;
}
