import {OrderDetail} from '../../../components/account';
export const metadata={title:'Đơn mua không tài khoản',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <OrderDetail id={id} guest/>;}
