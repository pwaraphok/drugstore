import db from '../database/data-source';
import * as E from '../database/entities';
import { hash } from 'bcrypt';
async function seed(){
 if(process.env.NODE_ENV==='production') throw new Error('Demo seed is disabled in production');
 await db.initialize();
 const password=process.env.SEED_PASSWORD;
 if(!password || password.length<12)throw new Error('Set SEED_PASSWORD (at least 12 characters)');
 await db.transaction(async em=>{
  if(await em.count(E.Branch)) { console.log('Existing database: seed skipped');return; }
  const branch=await em.save(em.create(E.Branch,{code:'MAIN',name:'เภสัชพร้อม • สาขาหลัก',address:'ข้อมูลสาธิตสำหรับทดสอบระบบ',timezone:'Asia/Bangkok',active:true}));
  const user=await em.save(em.create(E.User,{loginIdentifier:'owner',displayName:'ผู้ดูแลร้าน (ทดลอง)',passwordHash:await hash(password,12),status:'ACTIVE'}));
  for(const code of ['PHARMACIST','MANAGER','INVENTORY','CASHIER','AUDITOR','SYSTEM_ADMIN']){
   const role=await em.save(em.create(E.Role,{code,name:code}));
   if(['PHARMACIST','MANAGER','INVENTORY','CASHIER'].includes(code))await em.save(em.create(E.UserRole,{userId:String(user.id),roleId:String(role.id),branchId:String(branch.id)}));
  }
  await em.save(em.create(E.Pharmacist,{userId:String(user.id),name:'เภสัชกรสาธิต',licenseNumber:'DEMO-NOT-A-LICENSE',verificationStatus:'VERIFIED',verifiedAt:new Date()}));
  const unit=await em.save(em.create(E.Unit,{code:'EA',displayName:'ชิ้น'}));
  const supplier=await em.save(em.create(E.Supplier,{branchId:String(branch.id),name:'ผู้จำหน่ายสาธิต',active:true}));
  const shelf=await em.save(em.create(E.InventoryLocation,{branchId:String(branch.id),code:'A-01',locationType:'SHELF',status:'OPEN'}));
  await em.save(em.create(E.InventoryLocation,{branchId:String(branch.id),code:'Q-01',locationType:'QUARANTINE',status:'OPEN'}));
  const receipt=await em.save(em.create(E.GoodsReceipt,{branchId:String(branch.id),createdBy:String(user.id),supplierId:String(supplier.id),supplierDocument:'DEMO-OPENING',reasonNoPo:'ยอดสาธิตเริ่มต้น',receivedAt:new Date(),status:'POSTED'}));
  const data=[['DEMO-001','ผ้าก๊อซปลอดเชื้อ 2 × 2 นิ้ว','SUPPLY',12],['DEMO-002','พลาสเตอร์ปิดแผล ชนิดผ้า','SUPPLY',35],['DEMO-003','หน้ากากอนามัย 3 ชั้น','SUPPLY',5],['DEMO-004','เทอร์โมมิเตอร์ดิจิทัล','DEVICE',149],['DEMO-005','ยาตัวอย่าง A — สำหรับทดสอบเท่านั้น','DRUG',20],['DEMO-006','ยาตัวอย่าง B — สำหรับทดสอบเท่านั้น','DRUG',45]] as const;
  for(const [i,[sku,tradeName,productKind,price]] of data.entries()){
   const product=await em.save(em.create(E.Product,{sku,tradeName,productKind,baseUnitId:String(unit.id),quantityStep:'1',active:true}));
   const pkg=await em.save(em.create(E.ProductPackage,{productId:String(product.id),unitId:String(unit.id),baseQuantity:'1',active:true}));
   await em.save(em.create(E.ProductBarcode,{packageId:String(pkg.id),barcode:`00000000000${i+1}`}));
   await em.save(em.create(E.ProductPrice,{packageId:String(pkg.id),price:String(price),currency:'THB',validFrom:new Date('2020-01-01'),approvedBy:String(user.id)}));
   const expiry=new Date();expiry.setUTCDate(expiry.getUTCDate()+(i===0?45:365));const date=expiry.toISOString().slice(0,10);
   const lot=await em.save(em.create(E.ProductLot,{productId:String(product.id),lotNumber:`DEMO-L${i+1}`,expiryRaw:date,expiryPrecision:'DAY',usableUntilExclusive:date,globalStatus:'RELEASED'}));
   const balance=await em.save(em.create(E.StockBalance,{productId:String(product.id),lotId:String(lot.id),locationId:String(shelf.id),conditionStatus:'SELLABLE',onHand:'100',reserved:'0'}));
   const line=await em.save(em.create(E.GoodsReceiptItem,{goodsReceiptId:String(receipt.id),productId:String(product.id),lotId:String(lot.id),locationId:String(shelf.id),receivedQuantityBase:'100',unitCost:String(price/2),conditionStatus:'SELLABLE'}));
   await em.save(em.create(E.CostLayer,{goodsReceiptItemId:String(line.id),lotId:String(lot.id),receivedQuantity:'100',remainingQuantity:'100',unitCost:String(price/2),receivedAt:new Date()}));
   await em.save(em.create(E.StockMovement,{branchId:String(branch.id),balanceId:String(balance.id),quantityDelta:'100',movementType:'OPENING',businessDocumentType:'GOODS_RECEIPT_ITEM',businessDocumentId:String(receipt.id),businessDocumentLineId:String(line.id),movementLeg:'POST',occurredAt:new Date(),postedAt:new Date(),actorId:String(user.id)}));
  }
  await em.save(em.create(E.Patient,{branchId:String(branch.id),patientNumber:'DEMO-HN001',name:'ผู้รับบริการตัวอย่าง',allergyStatus:'NOT_ASKED'}));
  console.log('Seed complete. Login: owner. Password is the SEED_PASSWORD you supplied. Clinical knowledge is intentionally not seeded.');
 });
 await db.destroy();
}
seed().catch(async e=>{console.error(e.message);if(db.isInitialized)await db.destroy();process.exitCode=1;});
