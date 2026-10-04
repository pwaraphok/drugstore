import { Injectable, UnprocessableEntityException, NotImplementedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { d, money } from '../common/decimal';
import { IdempotencyService } from '../common/idempotency.service';
import { AuditService } from '../common/audit.service';
import { CashMovement, CashShift, PaymentAttempt, Refund, Sale, ReturnReceipt } from '../database/entities';
import { AuthUser } from '../identity/identity.service';
@Injectable()
export class PaymentsService {
 constructor(private readonly db:DataSource,private readonly idem:IdempotencyService,private readonly audit:AuditService){}
 async createAttempt(user:AuthUser,input:{saleId:string;method:'CASH'|'PROMPTPAY'|'CARD';amount:string;receivedAmount?:string;idempotencyKey:string}) {
  if(input.method!=='CASH') throw new NotImplementedException('ยังไม่เชื่อมผู้ให้บริการรับเงิน รองรับเงินสดเท่านั้น');
  if(d(input.amount).lte(0)||d(input.amount).decimalPlaces()>2) throw new UnprocessableEntityException('ยอดรับชำระไม่ถูกต้อง');
  return this.db.transaction(async em=>{
   const sale=await em.findOneOrFail(Sale,{where:{id:input.saleId,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
   const started=await this.idem.begin(em,`payment:${user.branchId}:${sale.id}`,input.idempotencyKey,input);
   if(started.replay)return started.replay;
   if(sale.status!=='AWAITING_PAYMENT')throw new UnprocessableEntityException('ต้องจองสินค้าและยืนยันบิลก่อนรับเงิน');
   const shift=await em.findOneOrFail(CashShift,{where:{id:sale.shiftId!,branchId:user.branchId,status:'OPEN'},lock:{mode:'pessimistic_write'}});
   const prior=await em.find(PaymentAttempt,{where:{saleId:String(sale.id),status:'SUCCEEDED'}});
   const refunds=prior.length?await em.find(Refund,{where:prior.map(p=>({originalPaymentId:String(p.id),status:'SUCCEEDED'}))}):[];
   const due=d(sale.grandTotal).minus(prior.reduce((a,p)=>a.plus(p.appliedAmount||p.amount),d(0))).plus(refunds.reduce((a,r)=>a.plus(r.amount),d(0)));
   if(d(input.amount).gt(due))throw new UnprocessableEntityException('ยอดรับเกินยอดค้าง');
   const received=d(input.receivedAmount || '0');
   if(received.lt(input.amount)||received.decimalPlaces()>2)throw new UnprocessableEntityException('เงินที่รับไม่พอหรือทศนิยมเกิน');
   const payment=await em.save(em.create(PaymentAttempt,{saleId:String(sale.id),method:'CASH',provider:'CASH',amount:money(input.amount),appliedAmount:money(input.amount),receivedAmount:money(received),changeAmount:money(received.minus(input.amount)),status:'SUCCEEDED',idempotencyKey:input.idempotencyKey}));
   await em.save(em.create(CashMovement,{cashShiftId:String(shift.id),movementType:'PAYMENT',amount:money(input.amount),reason:`payment:${payment.id}`}));
   await this.audit.record(em,{actorId:user.id,branchId:user.branchId,action:'CASH_PAYMENT',entityType:'payment',entityId:String(payment.id)});
   await this.idem.complete(em,started.request!,String(payment.id),payment);return payment;
  });
 }
 async promptpayWebhook(_signature:unknown,_body:unknown){throw new NotImplementedException('ยังไม่เปิดการเชื่อมต่อธนาคาร');}
 async refund(user:AuthUser,id:string,amount:string,reason:string,returnId?:string,key?:string){
  if(!reason?.trim()||d(amount).lte(0)||d(amount).decimalPlaces()>2)throw new UnprocessableEntityException('ระบุยอดและเหตุผลคืนเงินให้ถูกต้อง');
  return this.db.transaction(async em=>{
   const first=await em.findOneOrFail(PaymentAttempt,{where:{id}});
   const sale=await em.findOneOrFail(Sale,{where:{id:first.saleId,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
   const payment=await em.findOneOrFail(PaymentAttempt,{where:{id},lock:{mode:'pessimistic_write'}});
   const started=await this.idem.begin(em,`refund:${user.branchId}:${id}`,key,{id,amount,reason,returnId});if(started.replay)return started.replay;
   if(payment.status!=='SUCCEEDED'||payment.method!=='CASH')throw new UnprocessableEntityException('คืนได้เฉพาะเงินสดที่รับแล้ว');
   if(returnId)await em.findOneOrFail(ReturnReceipt,{where:{id:returnId,branchId:user.branchId,originalSaleId:String(sale.id)}});
   const prior=await em.find(Refund,{where:{originalPaymentId:id}});
   const reserved=prior.filter(r=>r.status!=='FAILED').reduce((a,r)=>a.plus(r.amount),d(0));
   if(reserved.plus(amount).gt(payment.appliedAmount||payment.amount))throw new UnprocessableEntityException('ยอดคืนเกินสิทธิ์');
   const shift=await em.findOneOrFail(CashShift,{where:{cashierId:user.id,branchId:user.branchId,status:'OPEN'},lock:{mode:'pessimistic_write'}});
   const refund=await em.save(em.create(Refund,{originalPaymentId:id,returnId:returnId||null,amount:money(amount),status:'SUCCEEDED',reason}));
   await em.save(em.create(CashMovement,{cashShiftId:String(shift.id),movementType:'REFUND',amount:money(d(amount).neg()),reason:`refund:${refund.id}`}));
   await this.audit.record(em,{actorId:user.id,branchId:user.branchId,action:'CASH_REFUND',entityType:'refund',entityId:String(refund.id),reason});
   await this.idem.complete(em,started.request!,String(refund.id),refund);return refund;
  });
 }
}
