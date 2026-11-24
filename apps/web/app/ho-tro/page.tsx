import {Suspense} from 'react';
import {SupportDesk} from '../../components/support-desk';
export const metadata={title:'Hỗ trợ khách hàng',robots:{index:false,follow:false}};
export default function Page(){return <Suspense fallback={<p>Đang tải hỗ trợ…</p>}><SupportDesk/></Suspense>;}
