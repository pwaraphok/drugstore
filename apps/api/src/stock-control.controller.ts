import {Body,Controller,Post,Headers,UnprocessableEntityException,ForbiddenException} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {CurrentUser} from './identity/current-user.decorator';
import {AuthUser} from './identity/identity.service';
import {InventoryService} from './inventory/inventory.service';
import {IdempotencyService} from './common/idempotency.service';
import {AuditService} from './common/audit.service';
import {d,qty,assertPositiveQuantity} from './common/decimal';
import * as E from './database/entities';
@Controller('inventory/control')
export class StockControlController {
 constructor(private readonly db:DataSource,private readonly inventory:InventoryService,private readonly idem:IdempotencyService,private readonly audit:AuditService){}
 @Post('count') async count(@CurrentUser()u:AuthUser,@Headers('idempotency-key')key:string,@Body()b:{balanceId:string;expectedVersion:number;countedQuantity:string;unitCost?:string;reason:string}){
  if(!u.roles.includes('MANAGER'))throw new ForbiddenException('ผู้จัดการต้องอนุมัติปรับยอด');
  if(!b.reason?.trim()||d(b.countedQuantity).lt(0)||d(b.countedQuantity).decimalPlaces()>6)throw new UnprocessableEntityException('ระบุยอดนับและเหตุผลให้ถูกต้อง');
  return this.db.transaction(async em=>{
   const preliminary=await em.findOneOrFail(E.StockBalance,{where:{id:b.balanceId}});await em.findOneOrFail(E.InventoryLocation,{where:{id:preliminary.locationId,branchId:u.branchId}});
   const {balances}=await this.inventory.lockLotsThenBalances(em,[preliminary.lotId],[b.balanceId]);const balance=balances[0];
   const started=await this.idem.begin(em,`count:${u.branchId}`,key,b);if(started.replay)return started.replay;
   if(balance.version!==Number(b.expectedVersion))throw new UnprocessableEntityException('ยอดเปลี่ยนหลังเปิดหน้าจอ กรุณานับและโหลดใหม่');
   const product=await em.findOneOrFail(E.Product,{where:{id:balance.productId}});if(d(b.countedQuantity).gt(0))assertPositiveQuantity(b.countedQuantity,product.quantityStep);
   if(d(balance.reserved).gt(0))throw new UnprocessableEntityException('มีการจองสินค้า ต้องจัดการบิลค้างก่อนปรับยอด');
   const delta=d(b.countedQuantity).minus(balance.onHand);
   if(delta.gt(0))throw new UnprocessableEntityException('ยอดเกินให้บันทึกผ่านรับเข้าเพื่อระบุแหล่งที่มาและต้นทุน');
   const count=await em.save(em.create(E.StockCount,{branchId:u.branchId,createdBy:u.id,snapshotAt:new Date(),status:'CLOSED'}));
   await em.save(em.create(E.StockCountItem,{stockCountId:String(count.id),balanceId:b.balanceId,snapshotVersion:balance.version,snapshotOnHand:balance.onHand,countedQuantity:qty(b.countedQuantity)}));
   if(!delta.eq(0)){
    await this.inventory.applyMovement(em,{branchId:u.branchId,balance,quantityDelta:qty(delta),movementType:'COUNT_ADJUSTMENT',documentType:'STOCK_COUNT',documentId:String(count.id),documentLineId:String(count.id),actorId:u.id});
    await this.inventory.consumeCostLayers(em,balance.lotId,qty(delta.neg()),'COUNT');
   }
   await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'STOCK_COUNT',entityType:'stock_count',entityId:String(count.id),reason:b.reason,after:{counted:b.countedQuantity}});
   await this.idem.complete(em,started.request!,String(count.id),count);return count;
  });
 }
 @Post('move') async move(@CurrentUser()u:AuthUser,@Headers('idempotency-key')key:string,@Body()b:{balanceId:string;quantity:string;destinationLocationId:string;conditionStatus:string;reason:string}){
  if(!b.reason?.trim()||!['SELLABLE','QUARANTINED','DAMAGED'].includes(b.conditionStatus))throw new UnprocessableEntityException('ระบุสถานะและเหตุผล');assertPositiveQuantity(b.quantity,'0.000001');
  return this.db.transaction(async em=>{
   const prelim=await em.findOneOrFail(E.StockBalance,{where:{id:b.balanceId}});await em.findOneOrFail(E.InventoryLocation,{where:{id:prelim.locationId,branchId:u.branchId}});
   const dest=await em.findOneOrFail(E.InventoryLocation,{where:{id:b.destinationLocationId,branchId:u.branchId,status:'OPEN'}});
   const {balances,lots}=await this.inventory.lockLotsThenBalances(em,[prelim.lotId],[b.balanceId]);const source=balances[0];
   const started=await this.idem.begin(em,`move:${u.branchId}`,key,b);if(started.replay)return started.replay;
   const product=await em.findOneOrFail(E.Product,{where:{id:source.productId}});assertPositiveQuantity(b.quantity,product.quantityStep);
   if(d(source.onHand).minus(source.reserved).lt(b.quantity))throw new UnprocessableEntityException('จำนวนที่ย้ายได้ไม่พอ');
   if(b.conditionStatus==='SELLABLE'&&(source.conditionStatus!=='SELLABLE'||dest.locationType==='QUARANTINE'))throw new UnprocessableEntityException('ไม่เปิดปล่อยสินค้ากักกันกลับขายผ่านการย้าย');
   if(source.locationId===b.destinationLocationId&&source.conditionStatus===b.conditionStatus)throw new UnprocessableEntityException('ต้นทางและปลายทางเหมือนกัน');
   let target=await em.findOne(E.StockBalance,{where:{lotId:source.lotId,locationId:b.destinationLocationId,conditionStatus:b.conditionStatus},lock:{mode:'pessimistic_write'}});
   if(!target)target=await em.save(em.create(E.StockBalance,{productId:source.productId,lotId:source.lotId,locationId:b.destinationLocationId,conditionStatus:b.conditionStatus,onHand:'0',reserved:'0'}));
   const transfer=await em.save(em.create(E.InventoryTransfer,{branchId:u.branchId,createdBy:u.id,sourceLocationId:source.locationId,destinationLocationId:b.destinationLocationId,status:'RECEIVED'}));
   const line=await em.save(em.create(E.InventoryTransferItem,{transferId:String(transfer.id),productId:source.productId,lotId:source.lotId,dispatchedQuantity:b.quantity,receivedQuantity:b.quantity}));
   for(const [balance,delta,leg]of [[source,qty(d(b.quantity).neg()),'OUT'],[target,qty(b.quantity),'IN']] as const)await this.inventory.applyMovement(em,{branchId:u.branchId,balance,quantityDelta:delta,movementType:'TRANSFER',documentType:'TRANSFER_ITEM',documentId:String(transfer.id),documentLineId:String(line.id),movementLeg:leg,actorId:u.id});
   await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'STOCK_TRANSFER',entityType:'transfer',entityId:String(transfer.id),reason:b.reason});
   await this.idem.complete(em,started.request!,String(transfer.id),transfer);return transfer;
  });
 }
 @Post('dispose') async dispose(@CurrentUser()u:AuthUser,@Headers('idempotency-key')key:string,@Body()b:{balanceId:string;quantity:string;reason:string}){
  if(!u.roles.includes('MANAGER')&&!u.roles.includes('PHARMACIST'))throw new ForbiddenException('ไม่มีสิทธิ์อนุมัติทำลาย');
  if(!b.reason?.trim())throw new UnprocessableEntityException('ระบุเหตุผลและหลักฐาน');assertPositiveQuantity(b.quantity,'0.000001');
  return this.db.transaction(async em=>{
   const prelim=await em.findOneOrFail(E.StockBalance,{where:{id:b.balanceId}});await em.findOneOrFail(E.InventoryLocation,{where:{id:prelim.locationId,branchId:u.branchId}});
   const {balances}=await this.inventory.lockLotsThenBalances(em,[prelim.lotId],[b.balanceId]);const balance=balances[0];
   const started=await this.idem.begin(em,`dispose:${u.branchId}`,key,b);if(started.replay)return started.replay;
   const product=await em.findOneOrFail(E.Product,{where:{id:balance.productId}});assertPositiveQuantity(b.quantity,product.quantityStep);
   const record=await em.save(em.create(E.DisposalRecord,{branchId:u.branchId,createdBy:u.id,lotId:balance.lotId,quantity:b.quantity,reason:b.reason,approverId:u.id}));
   const movement=await this.inventory.applyMovement(em,{branchId:u.branchId,balance,quantityDelta:qty(d(b.quantity).neg()),movementType:'DISPOSAL',documentType:'DISPOSAL',documentId:String(record.id),documentLineId:String(record.id),actorId:u.id});
   await this.inventory.consumeCostLayers(em,balance.lotId,b.quantity,'DISPOSAL');record.movementId=String(movement.id);await em.save(record);
   await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'DISPOSAL',entityType:'disposal',entityId:String(record.id),reason:b.reason});await this.idem.complete(em,started.request!,String(record.id),record);return record;
  });
 }
}
