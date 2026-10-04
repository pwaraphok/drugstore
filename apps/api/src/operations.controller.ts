import { Body, Controller, Get, Param, Post, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurrentUser } from './identity/current-user.decorator';
import { AuthUser } from './identity/identity.service';
import * as E from './database/entities';
import { d, assertPositiveQuantity } from './common/decimal';
import { AuditService } from './common/audit.service';

@Controller('operations')
export class OperationsController {
 constructor(private readonly db:DataSource,private readonly audit:AuditService){}
 private permit(u:AuthUser,roles:string[]){if(!roles.some(r=>u.roles.includes(r)))throw new ForbiddenException('ไม่มีสิทธิ์ดำเนินการ');}
 @Get('lookups') async lookups(@CurrentUser() u:AuthUser){
  const em=this.db.manager;
  return {units:await em.find(E.Unit),ingredients:await em.find(E.Ingredient),locations:await em.find(E.InventoryLocation,{where:{branchId:u.branchId}}),suppliers:await em.find(E.Supplier,{where:{branchId:u.branchId}}),cashShift:await em.findOne(E.CashShift,{where:{branchId:u.branchId,cashierId:u.id,status:'OPEN'}})};
 }
 @Get('stock') stock(@CurrentUser()u:AuthUser){return this.db.query(`SELECT b.*,p.trade_name,p.sku,l.lot_number,l.global_status,l.usable_until_exclusive,loc.code location FROM stock_balances b JOIN products p ON p.id=b.product_id JOIN product_lots l ON l.id=b.lot_id JOIN inventory_locations loc ON loc.id=b.location_id WHERE loc.branch_id=? ORDER BY p.trade_name,l.usable_until_exclusive`,[u.branchId]);}
 @Get('movements') movements(@CurrentUser()u:AuthUser){return this.db.query(`SELECT m.*,p.trade_name,l.lot_number FROM stock_movements m JOIN stock_balances b ON b.id=m.balance_id JOIN products p ON p.id=b.product_id JOIN product_lots l ON l.id=b.lot_id WHERE m.branch_id=? ORDER BY m.id DESC LIMIT 200`,[u.branchId]);}
 @Get('receipts') receipts(@CurrentUser()u:AuthUser){return this.db.manager.find(E.GoodsReceipt,{where:{branchId:u.branchId},order:{id:'DESC'},take:100});}
 @Get('returns') returns(@CurrentUser()u:AuthUser){return this.db.query(`SELECT r.id,r.original_sale_id,r.status,i.id item_id,i.quantity,i.disposition,i.inspection_status FROM return_receipts r JOIN return_receipt_items i ON i.return_receipt_id=r.id WHERE r.branch_id=? ORDER BY r.id DESC LIMIT 100`,[u.branchId]);}
 @Get('reconciliation') async reconciliation(@CurrentUser()u:AuthUser){
  this.permit(u,['MANAGER']);
  const paidUnfulfilled=await this.db.query(`SELECT s.id,s.invoice_number,s.status,s.grand_total,SUM(p.applied_amount-COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.original_payment_id=p.id AND r.status='SUCCEEDED'),0)) paid FROM sales s JOIN payment_attempts p ON p.sale_id=s.id AND p.status='SUCCEEDED' WHERE s.branch_id=? AND s.status<>'COMPLETED' GROUP BY s.id,s.invoice_number,s.status,s.grand_total HAVING paid>0`,[u.branchId]);
  const stockMismatch=await this.db.query(`SELECT b.id,b.on_hand,COALESCE(SUM(m.quantity_delta),0) ledger FROM stock_balances b JOIN inventory_locations loc ON loc.id=b.location_id LEFT JOIN stock_movements m ON m.balance_id=b.id WHERE loc.branch_id=? GROUP BY b.id,b.on_hand HAVING b.on_hand<>ledger`,[u.branchId]);
  return {paidUnfulfilled,stockMismatch};
 }
 @Post('products') async product(@CurrentUser()u:AuthUser,@Body()b:{sku:string;tradeName:string;productKind:string;unitId:string;price:string;barcode?:string;ingredientId?:string}){
  this.permit(u,['MANAGER','INVENTORY']);
  if(!b.sku?.trim()||!b.tradeName?.trim()||!['DRUG','SUPPLY','DEVICE'].includes(b.productKind)||d(b.price).lt(0))throw new UnprocessableEntityException('ข้อมูลสินค้าไม่ครบ');
  return this.db.transaction(async em=>{
   await em.findOneOrFail(E.Unit,{where:{id:b.unitId}});
   if(b.ingredientId)await em.findOneOrFail(E.Ingredient,{where:{id:b.ingredientId}});
   const p=await em.save(em.create(E.Product,{sku:b.sku.trim(),tradeName:b.tradeName.trim(),productKind:b.productKind,baseUnitId:b.unitId,quantityStep:'1',active:true}));
   const pkg=await em.save(em.create(E.ProductPackage,{productId:String(p.id),unitId:b.unitId,baseQuantity:'1',active:true}));
   await em.save(em.create(E.ProductPrice,{packageId:String(pkg.id),price:b.price,currency:'THB',validFrom:new Date(),approvedBy:u.id}));
   if(b.barcode)await em.save(em.create(E.ProductBarcode,{packageId:String(pkg.id),barcode:b.barcode}));
   if(b.ingredientId)await em.save(em.create(E.ProductIngredient,{productId:String(p.id),ingredientId:b.ingredientId}));
   await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'PRODUCT_CREATED',entityType:'product',entityId:String(p.id)});return p;
  });
 }
 @Post('packages') async package(@CurrentUser()u:AuthUser,@Body()b:{productId:string;unitId:string;baseQuantity:string;price:string;barcode?:string}){
  this.permit(u,['MANAGER','INVENTORY']);assertPositiveQuantity(b.baseQuantity,'0.000001');if(d(b.price).lt(0))throw new UnprocessableEntityException('ราคาไม่ถูกต้อง');
  return this.db.transaction(async em=>{await em.findOneOrFail(E.Product,{where:{id:b.productId}});await em.findOneOrFail(E.Unit,{where:{id:b.unitId}});const pkg=await em.save(em.create(E.ProductPackage,{productId:b.productId,unitId:b.unitId,baseQuantity:b.baseQuantity,active:true}));await em.save(em.create(E.ProductPrice,{packageId:String(pkg.id),price:b.price,currency:'THB',validFrom:new Date(),approvedBy:u.id}));if(b.barcode)await em.save(em.create(E.ProductBarcode,{packageId:String(pkg.id),barcode:b.barcode}));return pkg;});
 }
 @Post('suppliers') async supplier(@CurrentUser()u:AuthUser,@Body()b:{name:string;contact?:string;address?:string}){this.permit(u,['MANAGER','INVENTORY']);if(!b.name?.trim())throw new UnprocessableEntityException('ระบุชื่อผู้จำหน่าย');return this.db.manager.save(this.db.manager.create(E.Supplier,{branchId:u.branchId,name:b.name,contact:b.contact||null,address:b.address||null,active:true}));}
 @Post('ingredients') async ingredient(@CurrentUser()u:AuthUser,@Body()b:{code:string;preferredName:string}){this.permit(u,['PHARMACIST']);if(!b.code?.trim()||!b.preferredName?.trim())throw new UnprocessableEntityException('ระบุรหัสและชื่อสารสำคัญ');return this.db.manager.save(this.db.manager.create(E.Ingredient,{code:b.code,preferredName:b.preferredName}));}
 @Post('units') async unit(@CurrentUser()u:AuthUser,@Body()b:{code:string;displayName:string}){this.permit(u,['MANAGER','INVENTORY']);if(!b.code?.trim()||!b.displayName?.trim())throw new UnprocessableEntityException('ระบุหน่วย');return this.db.manager.save(this.db.manager.create(E.Unit,{code:b.code,displayName:b.displayName}));}
 @Post('patients/:id/history') async history(@CurrentUser()u:AuthUser,@Param('id')id:string,@Body()b:{allergyStatus:string}){
  this.permit(u,['PHARMACIST']);if(!['UNKNOWN','NOT_ASKED','NO_KNOWN_ALLERGIES','KNOWN_ALLERGIES'].includes(b.allergyStatus))throw new UnprocessableEntityException('สถานะไม่ถูกต้อง');
  return this.db.transaction(async em=>{const p=await em.findOneOrFail(E.Patient,{where:{id,branchId:u.branchId},lock:{mode:'pessimistic_write'}});if(b.allergyStatus==='NO_KNOWN_ALLERGIES'&&await em.count(E.PatientAllergy,{where:{patientId:id}}))throw new UnprocessableEntityException('ยังมีประวัติแพ้ยาบันทึกอยู่');p.allergyStatus=b.allergyStatus;p.recordVersion++;p.allergyStatusConfirmedBy=u.id;p.allergyStatusConfirmedAt=new Date();return em.save(p);});
 }
 @Post('patients/:id/medications') async medication(@CurrentUser()u:AuthUser,@Param('id')id:string,@Body()b:{productId?:string;ingredientId?:string;rawName?:string;doseText?:string}){
  this.permit(u,['PHARMACIST']);if(!b.productId&&!b.ingredientId&&!b.rawName?.trim())throw new UnprocessableEntityException('ระบุยาที่ใช้อยู่');
  return this.db.transaction(async em=>{const p=await em.findOneOrFail(E.Patient,{where:{id,branchId:u.branchId},lock:{mode:'pessimistic_write'}});if(b.productId)await em.findOneOrFail(E.Product,{where:{id:b.productId}});if(b.ingredientId)await em.findOneOrFail(E.Ingredient,{where:{id:b.ingredientId}});const med=await em.save(em.create(E.PatientMedication,{patientId:id,productId:b.productId||null,ingredientId:b.ingredientId||null,rawName:b.rawName||null,doseText:b.doseText||null,activeStatus:true}));p.recordVersion++;await em.save(p);return med;});
 }
}
