"use client";
import {useEffect,useState} from 'react';
import {api} from './client';
export const sizeLabels:Record<string,string>={chest:'Vòng ngực',length:'Dài',shoulder:'Vai',sleeve:'Tay',waist:'Vòng eo',hip:'Vòng mông',inseam:'Dài trong'};
export function ProductSizeGuide({productId}:{productId:string}){
  const [guide,setGuide]=useState<any>(undefined);
  useEffect(()=>{let active=true;api(`/experience/size-guides/${encodeURIComponent(productId)}`).then(value=>{if(active)setGuide(value.guide||null);}).catch(()=>{if(active)setGuide(null);});return()=>{active=false;};},[productId]);
  const columns=guide?Object.keys(sizeLabels).filter(key=>guide.rows.some((row:any)=>typeof row[key]==='number')):[];
  return <details id="size-guide" className="product-size-guide"><summary>Bảng size & cách chọn</summary>{guide===undefined?<p>Đang tải bảng size…</p>:guide?<><p>Số đo riêng của mẫu áo/quần này · cm. Vòng ngực, eo, mông là số đo vòng; vai là ngang vai.</p><div className="size-table-wrap"><table><caption>Số đo sản phẩm</caption><thead><tr><th>Size</th>{columns.map(key=><th key={key}>{sizeLabels[key]}</th>)}</tr></thead><tbody>{guide.rows.map((row:any)=><tr key={row.size}><th>{row.size}</th>{columns.map(key=><td key={key}>{row[key]??'—'}</td>)}</tr>)}</tbody></table></div>{guide.note&&<p>{guide.note}</p>}{guide.model&&<p>Người mẫu cao {guide.model.height} cm, mặc size {guide.model.size}. {guide.model.note}</p>}</>:<p>Cửa hàng chưa công bố số đo riêng cho mẫu này. Hãy gửi tên mẫu và size bạn thường mặc để Milo hỗ trợ; không dùng bảng mẫu chung để khẳng định độ vừa.</p>}<p>Đo một sản phẩm đang mặc thoải mái để so sánh. Đặt áo/quần phẳng, đo ngang ngực/eo rồi nhân đôi để được số đo vòng; chiều dài đo dọc thân.</p></details>;
}
