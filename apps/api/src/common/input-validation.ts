import { UnprocessableEntityException } from '@nestjs/common';
export function validateRequest(req:{path:string;method:string;params?:Record<string,string>;body?:unknown}){
 const bad=()=>{throw new UnprocessableEntityException('ข้อมูลคำขอไม่ครบหรือรูปแบบไม่ถูกต้อง');};
 for(const [k,v] of Object.entries(req.params||{}))if((k==='id'||k.endsWith('Id'))&&!/^[1-9]\d{0,18}$/.test(v))bad();
 if(req.method==='GET')return;
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))bad();
 const visit=(v:unknown,key='',depth=0)=>{
  if(depth>8)bad();
  if(v===null||v===undefined)return;
  if((key==='id'||key.endsWith('Id'))&&(typeof v!=='string'||!/^[1-9]\d{0,18}$/.test(v)))bad();
  if(typeof v==='string'){
   if(v.length>10000)bad();
   if((key==='id'||key.endsWith('Id'))&&v!==''&&!/^[1-9]\d{0,18}$/.test(v))bad();
  }else if(Array.isArray(v)){if(v.length>100)bad();v.forEach(x=>visit(x,'',depth+1));}
  else if(typeof v==='object'){for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))bad();visit(x,k,depth+1);}}
 };
 visit(req.body);
 const rules:[RegExp,string[]][]=[
  [/^\/operations\/products$/,['sku','tradeName','productKind','unitId','price']],
  [/^\/operations\/packages$/,['productId','unitId','baseQuantity','price']],
  [/^\/management\/users$/,['loginIdentifier','displayName','password','role']],
  [/^\/patients$/,['name']],
  [/^\/sessions$/,['loginIdentifier','password','branchId']],
  [/^\/sales\/\d+\/items$/,['productId','packageId','quantity']],
  [/^\/sales\/\d+\/finalize$/,['cartVersion']],
  [/^\/sales\/\d+\/clinical-decisions$/,['checkId','alertId','action','reason']],
  [/^\/payment-attempts$/,['saleId','method','amount']],
  [/^\/refunds$/,['originalPaymentId','amount','reason']],
  [/^\/returns$/,['originalSaleId','quarantineLocationId','items']],
  [/^\/returns\/assess$/,['returnItemId','disposition']],
  [/^\/purchase-orders\/receive$/,['supplierId','items']],
  [/^\/purchase-orders\/recalls$/,['reason','lotIds']],
  [/^\/purchase-orders$/,['supplierId','items']],
  [/^\/purchase-orders\/actions\/approve$/,['id']],
  [/^\/print-jobs\/labels$/,['saleId']],
  [/^\/print-jobs\/\d+\/state$/,['state']],
  [/^\/sales\/cash-shifts\/open$/,['openingFloat']],
  [/^\/sales\/cash-shifts\/close$/,['countedCash']],
  [/^\/inventory\/control\/count$/,['balanceId','expectedVersion','countedQuantity','reason']],
  [/^\/inventory\/control\/move$/,['balanceId','quantity','destinationLocationId','conditionStatus','reason']],
  [/^\/inventory\/control\/dispose$/,['balanceId','quantity','reason']],
 ];
 const body=req.body as Record<string,unknown>;
 for(const [path,fields]of rules)if(path.test(req.path))for(const f of fields)if(body[f]===undefined||body[f]===null||body[f]===''||(Array.isArray(body[f])&&!body[f].length))bad();
 const requiredItemFields=req.path==='/purchase-orders/receive'?['productId','packageId','quantity','lotNumber','expiryRaw','expiryPrecision','usableUntilExclusive','unitCost','locationId']:req.path==='/returns'?['originalAllocationId','quantity']:req.path==='/purchase-orders'?['productId','packageId','orderedQuantity','expectedCost']:[];
 if(requiredItemFields.length){if(!Array.isArray(body.items)||!body.items.length)bad();for(const item of body.items as Record<string,unknown>[])for(const f of requiredItemFields)if(!item||item[f]===undefined||item[f]===null||item[f]==='')bad();}
}
