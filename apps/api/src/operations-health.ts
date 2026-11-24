import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import Redis from 'ioredis';
import { Db, AdminGuard, env, transaction, projectRoot } from './core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const workerHeartbeatKey='operations:worker:v1';
export class OperationsMonitor{
  private cursor='';
  private running=false;
  constructor(private db:Db){}
  async sample(){
    if(this.running)return;
    this.running=true;
    try{
    const [failed,payments,old,low]=await Promise.all([this.db.outboxEvent.count({where:{status:'FAILED'}}),this.db.payment.count({where:{status:'EXCEPTION'}}),this.db.outboxEvent.findFirst({where:{status:'PENDING'},orderBy:{createdAt:'asc'},select:{createdAt:true}}),this.db.$queryRaw<{id:string}[]>`SELECT i.id FROM "Inventory" i JOIN "ProductVariant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId" WHERE v.active AND p.active AND i."onHand"-i.reserved <= i."lowThreshold" AND i.id > ${this.cursor} ORDER BY i.id LIMIT 200`]);
    this.cursor=low.length===200?low[low.length-1].id:'';
    const signals:{key:string;code:string;active:boolean;entityId?:string}[]=[{key:'jobs-failed',code:'JOBS_FAILED',active:failed>0},{key:'payment-exception',code:'PAYMENT_EXCEPTION',active:payments>0},{key:'jobs-delayed',code:'JOBS_DELAYED',active:!!old&&old.createdAt.getTime()<Date.now()-15*60000},...low.map(row=>({key:`stock:${row.id}`,code:'LOW_STOCK',active:true,entityId:row.id}))];
    const keys=new Set(low.map(row=>`stock:${row.id}`));
    const existing=await this.db.operationAlert.findMany({where:{code:'LOW_STOCK',active:true},select:{key:true,entityId:true},take:1000});
    for(const alert of existing)if(!keys.has(alert.key)&&alert.entityId){const inv=await this.db.inventory.findUnique({where:{id:alert.entityId}});if(!inv||inv.onHand-inv.reserved>inv.lowThreshold)signals.push({key:alert.key,code:'LOW_STOCK',active:false});}
    for(const signal of signals)await transaction(this.db,async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`operation-alert:${signal.key}`},0))`;
      const prior=await tx.operationAlert.findUnique({where:{key:signal.key}});
      if(!signal.active){if(prior?.active)await tx.operationAlert.update({where:{key:signal.key},data:{active:false,resolvedAt:new Date(),lastSeenAt:new Date()}});return;}
      if(prior?.active){await tx.operationAlert.update({where:{key:signal.key},data:{lastSeenAt:new Date()}});return;}
      const saved=await tx.operationAlert.upsert({where:{key:signal.key},create:{...signal},update:{active:true,revision:{increment:1},openedAt:new Date(),lastSeenAt:new Date(),resolvedAt:null}});
      const staff=await tx.user.findMany({where:{disabled:false,role:{in:signal.code==='LOW_STOCK'?['ADMIN','SELLER']:['ADMIN']}},select:{id:true}});
      if(staff.length)await tx.notification.createMany({data:staff.map(actor=>({userId:actor.id,key:`operations:${signal.key}:${saved.revision}:${actor.id}`,title:signal.code==='LOW_STOCK'?'Có SKU cần bổ sung hàng':'Cần kiểm tra vận hành Milo',body:signal.code==='LOW_STOCK'?'Số lượng có thể bán đã chạm ngưỡng cảnh báo.':'Có tác vụ hoặc giao dịch cần Admin kiểm tra.',href:signal.code==='LOW_STOCK'?'/nguoi-ban':'/admin'}))});
    });return {failed,payments,oldestPendingAt:old?.createdAt||null,lowStock:low.length,lowStockCapped:low.length===200};
    }finally{this.running=false;}
  }
}
@UseGuards(AdminGuard) @Controller('admin/operations')
export class OperationsController{
  constructor(@Inject(Db)private db:Db){}
  @Get() async health(){
    const [heartbeat,alerts,failed,payments,pending]=await Promise.all([this.db.storeSetting.findUnique({where:{key:workerHeartbeatKey}}),this.db.operationAlert.findMany({where:{active:true},orderBy:{openedAt:'desc'},take:100}),this.db.outboxEvent.count({where:{status:'FAILED'}}),this.db.payment.count({where:{status:'EXCEPTION'}}),this.db.outboxEvent.findFirst({where:{status:'PENDING'},orderBy:{createdAt:'asc'},select:{createdAt:true}})]);
    const lastAt=typeof (heartbeat?.value as any)?.at==='string'?(heartbeat!.value as any).at:null;
    let redisStatus=false;const redis=new Redis(env.REDIS_URL||'redis://localhost:6379',{lazyConnect:true,connectTimeout:1500,maxRetriesPerRequest:0,retryStrategy:()=>null});redis.on('error',()=>{});try{await redis.connect();redisStatus=await redis.ping()==='PONG';}catch{}finally{redis.disconnect();}
    let backup:{at?:string;encrypted?:boolean;restoreVerified?:boolean}|null=null;try{const raw=JSON.parse(await readFile(resolve(projectRoot,'.local/operations/backup-status.json'),'utf8'));backup={at:typeof raw.at==='string'?raw.at:undefined,encrypted:raw.encrypted===true,restoreVerified:raw.restoreVerified===true};}catch{}
    return {at:new Date(),database:true,redis:redisStatus,worker:{lastAt,healthy:!!lastAt&&Date.now()-new Date(lastAt).getTime()<90000},jobs:{failed,oldestPendingAt:pending?.createdAt||null},payments:{exceptions:payments},alerts,backup,integrations:{googleConfigured:!!env.GOOGLE_CLIENT_ID&&!!env.GOOGLE_CLIENT_SECRET,gmailConfigured:env.EMAIL_PROVIDER==='smtp'&&!!env.SMTP_USER&&!!env.SMTP_PASSWORD,paymentMode:env.PAYMENT_PROVIDER||'unconfigured',shippingMode:env.SHIPPING_PROVIDER||'unconfigured',cloudinaryConfigured:!!env.CLOUDINARY_CLOUD_NAME&&!!env.CLOUDINARY_API_KEY&&!!env.CLOUDINARY_API_SECRET},note:'Cấu hình có mặt không xác nhận đã kiểm thử nhà cung cấp. Backup báo chưa có dữ liệu nếu chưa chạy script backup mã hóa.'};
  }
}
