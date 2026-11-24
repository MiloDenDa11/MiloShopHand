import { Controller, Get, Post, Patch, Param, Body, Query, Req, Inject, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Db, AppRequest, AuthGuard, SellerGuard, parse, fail, transaction, audit } from './core';
import { guestSession } from './guest-checkout';
const statuses=['OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED'] as const;
const createSchema=z.object({subject:z.string().trim().min(5).max(150),topic:z.enum(['ORDER','SIZE','RETURN','OTHER']),orderId:z.string().min(1).max(100).optional(),message:z.string().trim().min(5).max(3000),requestId:z.string().uuid()}).strict();
const messageSchema=z.object({body:z.string().trim().min(1).max(3000),requestId:z.string().uuid(),internal:z.boolean().default(false)}).strict();
export class SupportService {
  constructor(private db:Db){}
  async create(input:z.infer<typeof createSchema>,r:AppRequest) {
    const guest=!r.actor?await guestSession(this.db,r):null;
    if(guest&&!input.orderId)fail('ORDER_REQUIRED','Yêu cầu hỗ trợ của khách mua không tài khoản cần gắn với đơn hàng.',422);
    return transaction(this.db,async tx=>{
      const lockKey=`support-create:${r.actor?.id||guest!.id}`;await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
      if(input.orderId&&!await tx.order.findFirst({where:{id:input.orderId,...(r.actor?{userId:r.actor.id}:{guestSessionId:guest!.id,userId:null})}}))fail('NOT_FOUND','Không tìm thấy đơn của bạn.',404);
      const authorId=r.actor?.id||`guest:${guest!.id}`;
      const prior=await tx.supportMessage.findFirst({where:{requestId:input.requestId,authorId},include:{ticket:true}});
      if(prior){if(prior.body!==input.message||prior.ticket.subject!==input.subject||prior.ticket.orderId!==(input.orderId||null)||prior.ticket.topic!==input.topic)fail('IDEMPOTENCY_CONFLICT','Mã yêu cầu đã dùng cho nội dung khác.',409);return prior.ticket;}
      if(await tx.supportTicket.count({where:{...(r.actor?{userId:r.actor.id}:{orderId:input.orderId}),status:{in:['OPEN','IN_PROGRESS','WAITING_CUSTOMER']}}})>=10)fail('SUPPORT_LIMIT','Bạn đang có nhiều yêu cầu cần xử lý. Hãy trả lời trong yêu cầu hiện có.',429);
      const ticket=await tx.supportTicket.create({data:{subject:input.subject,topic:input.topic,userId:r.actor?.id,orderId:input.orderId,messages:{create:{authorId,authorRole:'CUSTOMER',body:input.message,requestId:input.requestId}}}});
      const staff=await tx.user.findMany({where:{role:{in:['ADMIN','SELLER']},disabled:false},select:{id:true}});
      if(staff.length)await tx.notification.createMany({data:staff.map(actor=>({userId:actor.id,key:`support:new:${ticket.id}:${actor.id}`,title:'Có yêu cầu hỗ trợ mới',body:input.subject,href:`/ho-tro?ticket=${ticket.id}`}))});
      return ticket;
    });
  }
  async accessible(id:string,r:AppRequest,staff=false){
    const guest=!r.actor?await guestSession(this.db,r):null;
    const ticket=await this.db.supportTicket.findFirst({where:{id,...(staff?{}:r.actor?{OR:[{userId:r.actor.id},{order:{userId:r.actor.id}}]}:{order:{guestSessionId:guest!.id,userId:null}})},include:{messages:{where:staff?{}:{internal:false},orderBy:{createdAt:'asc'},take:200},order:{select:{code:true,status:true}}}});
    if(!ticket)fail('NOT_FOUND','Không tìm thấy yêu cầu hỗ trợ.',404);return ticket;
  }
  async reply(id:string,input:z.infer<typeof messageSchema>,r:AppRequest,staff=false){
    await this.accessible(id,r,staff);if(!staff&&input.internal)fail('FORBIDDEN','Bạn không có quyền tạo ghi chú nội bộ.',403);
    const guest=!r.actor?await guestSession(this.db,r):null,authorId=r.actor?.id||`guest:${guest!.id}`;
    await transaction(this.db,async tx=>{
      await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id=${id} FOR UPDATE`;
      const ticket=await tx.supportTicket.findUniqueOrThrow({where:{id}});
      if(!staff){
        const order=ticket.orderId?await tx.order.findUnique({where:{id:ticket.orderId},select:{userId:true,guestSessionId:true}}):null;
        if(r.actor?ticket.userId!==r.actor.id&&order?.userId!==r.actor.id:order?.guestSessionId!==guest!.id||order?.userId!==null||guest!.expiresAt<=new Date())fail('NOT_FOUND','Không tìm thấy yêu cầu hỗ trợ.',404);
      }
      if(staff&&r.actor!.role!=='ADMIN'&&ticket.assigneeId&&ticket.assigneeId!==r.actor!.id)fail('SUPPORT_ASSIGNED','Yêu cầu đang do nhân viên khác phụ trách.',403);
      const prior=await tx.supportMessage.findUnique({where:{ticketId_requestId:{ticketId:id,requestId:input.requestId}}});
      if(prior){if(prior.authorId!==authorId||prior.body!==input.body||prior.internal!==input.internal)fail('IDEMPOTENCY_CONFLICT','Mã yêu cầu đã được sử dụng.',409);return;}
      if(ticket.status==='CLOSED')fail('SUPPORT_CLOSED','Yêu cầu đã đóng. Hãy tạo yêu cầu mới nếu cần.',409);
      if(await tx.supportMessage.count({where:{ticketId:id}})>=200)fail('SUPPORT_MESSAGE_LIMIT','Yêu cầu đã đạt giới hạn tin nhắn. Hãy tạo yêu cầu mới và dẫn lại mã này.',429);
      await tx.supportMessage.create({data:{ticketId:id,authorId,authorRole:staff?'STAFF':'CUSTOMER',...input}});
      await tx.supportTicket.update({where:{id},data:{revision:{increment:1},...(!staff?{status:'OPEN'}:{})}});
      const ownerId=ticket.userId||(ticket.orderId?(await tx.order.findUnique({where:{id:ticket.orderId},select:{userId:true}}))?.userId:null);
      const recipients=staff?(ownerId?[ownerId]:[]):(await tx.user.findMany({where:{disabled:false,OR:[{role:'ADMIN'},...(ticket.assigneeId?[{id:ticket.assigneeId,role:'SELLER' as const}]:[{role:'SELLER' as const}])]},select:{id:true}})).map(row=>row.id);
      if(!input.internal&&recipients.length)await tx.notification.createMany({data:recipients.map(userId=>({userId,key:`support:reply:${input.requestId}:${userId}`,title:'Có phản hồi yêu cầu hỗ trợ',body:ticket.subject,href:`/ho-tro?ticket=${id}`}))});
    });return this.accessible(id,r,staff);
  }
}
@Controller('support')
export class SupportController{
  constructor(@Inject(Db)private db:Db){}
  @UseGuards(AuthGuard) @Get() list(@Req()r:AppRequest){return this.db.supportTicket.findMany({where:{OR:[{userId:r.actor!.id},{order:{userId:r.actor!.id}}]},select:{id:true,subject:true,status:true,topic:true,createdAt:true,updatedAt:true},orderBy:{updatedAt:'desc'},take:100});}
  @Post() create(@Body()body:unknown,@Req()r:AppRequest){return new SupportService(this.db).create(parse(createSchema,body),r);}
  @Get(':id') detail(@Param('id')id:string,@Req()r:AppRequest){return new SupportService(this.db).accessible(id,r);}
  @Post(':id/messages') reply(@Param('id')id:string,@Body()body:unknown,@Req()r:AppRequest){return new SupportService(this.db).reply(id,parse(messageSchema,body),r);}
}
@UseGuards(SellerGuard) @Controller('seller/support')
export class SellerSupportController{
  constructor(@Inject(Db)private db:Db){}
  @Get() list(@Query()query:unknown){const input=parse(z.object({status:z.enum(statuses).optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict(),query);return this.db.supportTicket.findMany({where:{...(input.status?{status:input.status}:{})},orderBy:{updatedAt:'desc'},skip:(input.page-1)*50,take:50,include:{order:{select:{code:true,status:true}}}});}
  @Get(':id') detail(@Param('id')id:string,@Req()r:AppRequest){return new SupportService(this.db).accessible(id,r,true);}
  @Post(':id/messages') reply(@Param('id')id:string,@Body()body:unknown,@Req()r:AppRequest){return new SupportService(this.db).reply(id,parse(messageSchema,body),r,true);}
  @Patch(':id') async update(@Param('id')id:string,@Body()body:unknown,@Req()r:AppRequest){const input=parse(z.object({expectedRevision:z.number().int().positive(),status:z.enum(statuses),assigneeId:z.string().min(1).max(100).nullable()}).strict(),body);await transaction(this.db,async tx=>{await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id=${id} FOR UPDATE`;const row=await tx.supportTicket.findUnique({where:{id}});if(!row)fail('NOT_FOUND','Không tìm thấy yêu cầu.',404);if(row.revision!==input.expectedRevision)fail('SUPPORT_CHANGED','Yêu cầu vừa thay đổi. Hãy tải lại.',409);if(r.actor!.role!=='ADMIN'&&(row.assigneeId&&row.assigneeId!==r.actor!.id||input.assigneeId&&input.assigneeId!==r.actor!.id))fail('FORBIDDEN','Bạn chỉ có thể nhận yêu cầu chưa phân công hoặc xử lý yêu cầu của mình.',403);if(input.assigneeId&&!await tx.user.findFirst({where:{id:input.assigneeId,role:{in:['ADMIN','SELLER']},disabled:false}}))fail('INVALID_ASSIGNEE','Người nhận không có quyền xử lý.',422);await tx.supportTicket.update({where:{id},data:{status:input.status,assigneeId:input.assigneeId,revision:{increment:1}}});await audit(tx,r.actor!.id,'SUPPORT_UPDATED','SupportTicket',id,{status:input.status,assigneeId:input.assigneeId});});return new SupportService(this.db).accessible(id,r,true);}
}
