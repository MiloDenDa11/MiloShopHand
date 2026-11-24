import { Controller, Get, Post, Param, Body, Req, Res, Headers, Inject, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { Db, AppRequest, env, hash, secret, cookieOptions, fail, parse, transaction, audit, AuthGuard, reauth } from './core';
import { CommerceService, userOrderInclude, orderDto } from './commerce';
import { email, phone } from './auth';
import { checkoutSchema, cancellationSchema, cancellationReasons } from '../../../packages/shared/src';
const cookie = 'milo_guest';
const lifetime = 30*86400000;
export async function guestSession(db: Db, r: AppRequest) {
  const token = r.cookies?.[cookie];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('GUEST_SESSION_REQUIRED','Mở lại trang thanh toán để bắt đầu phiên đặt hàng.',401);
  const session = await db.guestSession.findUnique({ where:{tokenHash:hash(token)} });
  if (!session || session.expiresAt <= new Date()) fail('GUEST_SESSION_EXPIRED','Phiên tra cứu đã hết hạn. Đăng nhập hoặc liên hệ Milo để được hỗ trợ.',401);
  return session;
}
@Controller('guest')
export class GuestCheckoutController {
  constructor(@Inject(Db) private db:Db,@Inject(CommerceService) private commerce:CommerceService) {}
  @Post('session') async session(@Body() body:unknown,@Req() r:AppRequest,@Res({passthrough:true}) res:Response) {
    parse(z.object({}).strict(),body);
    let session; try { session=await guestSession(this.db,r); } catch { const raw=secret(); session=await this.db.guestSession.create({data:{tokenHash:hash(raw),expiresAt:new Date(Date.now()+lifetime)}});res.cookie(cookie,raw,{...cookieOptions,maxAge:lifetime}); }
    return {expiresAt:session.expiresAt};
  }
  @Post('quote') async quote(@Body() body:unknown,@Req() r:AppRequest) {
    await guestSession(this.db,r);const input=parse(checkoutSchema.extend({email}),body);const {email:address,...order}=input;
    if(order.coupon)fail('GUEST_COUPON_LOGIN','Đăng nhập để sử dụng mã ưu đãi theo tài khoản.',422);
    return this.commerce.quote('guest',order);
  }
  @Post('checkout') async checkout(@Body() body:unknown,@Headers('idempotency-key') key:string,@Req() r:AppRequest) {
    if(r.actor)fail('ACCOUNT_CHECKOUT','Bạn đã đăng nhập. Hãy dùng thanh toán từ tài khoản hiện tại.',409);
    const session=await guestSession(this.db,r), input=parse(checkoutSchema.extend({email}),body), {email:address,...order}=input;
    const phoneHash=createHmac('sha256',env.SESSION_SECRET!).update(`guest-cod:${phone(order.address.phone)}`).digest('hex');
    return this.commerce.checkout(null,order,key,{sessionId:session.id,email:address,phoneHash});
  }
  private async owned(id:string,r:AppRequest) { const session=await guestSession(this.db,r);const order=await this.db.order.findFirst({where:{id,guestSessionId:session.id,userId:null},include:userOrderInclude});if(!order)fail('NOT_FOUND','Không tìm thấy đơn trong phiên này.',404);return {order,session}; }
  @Get('orders/:id') async order(@Param('id') id:string,@Req() r:AppRequest) {return orderDto((await this.owned(id,r)).order);}
  @Post('orders/:id/cancel') async cancel(@Param('id') id:string,@Body() body:unknown,@Req() r:AppRequest) {const {session}=await this.owned(id,r),input=parse(cancellationSchema,body);return orderDto(await this.commerce.transition(id,'CANCELLED',`guest:${session.id}`,`Người mua hủy: ${cancellationReasons[input.reasonCode]}${input.detail?` — ${input.detail}`:''}`,true,{guestSessionId:session.id,cancellationCode:input.reasonCode}));}
  @Post('orders/:id/complete') async complete(@Param('id') id:string,@Body() body:unknown,@Req() r:AppRequest) {parse(z.object({}).strict(),body);const {session}=await this.owned(id,r);return orderDto(await this.commerce.transition(id,'COMPLETED',`guest:${session.id}`,'Khách mua không tài khoản xác nhận đã nhận hàng',false,{buyerComplete:true,guestSessionId:session.id}));}
  @UseGuards(AuthGuard) @Post('orders/:id/claim') async claim(@Param('id') id:string,@Body() body:unknown,@Req() r:AppRequest) {
    parse(z.object({}).strict(),body);reauth(r);const session=await guestSession(this.db,r);
    await transaction(this.db,async tx=>{await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;const [order,user]=await Promise.all([tx.order.findFirst({where:{id,guestSessionId:session.id,userId:null},include:{guestContact:true}}),tx.user.findUnique({where:{id:r.actor!.id}})]);if(!order||!user||user.disabled||!user.verifiedAt||user.email!==order.guestContact?.email)fail('CLAIM_VERIFICATION_REQUIRED','Cần tài khoản đã xác minh đúng email đặt hàng và phiên mua gốc để liên kết đơn.',403);await tx.order.update({where:{id},data:{userId:user.id,guestSessionId:null}});await tx.guestContact.update({where:{orderId:id},data:{claimedAt:new Date()}});await audit(tx,user.id,'GUEST_ORDER_CLAIMED','Order',id);});return {message:'Đã liên kết đơn với tài khoản.'};
  }
}
