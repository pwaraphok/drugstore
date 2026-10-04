export interface SafetyInput {
 products: {id:string; ingredientIds:string[]}[];
 allergies: {ingredientId?:string|null; productId?:string|null; drugClassId?:string|null; rawName?:string|null; severity?:string|null}[];
 memberships: {ingredientId:string;drugClassId:string}[];
 medicationIngredients:string[];
 rules:{id:string;ruleType:string;ingredientAId:string|null;ingredientBId:string|null;severity:string;defaultAction:string;evidenceReference:string|null}[];
}
export function evaluateSafety(input:SafetyInput) {
 const alerts:{ruleId:string|null;severity:string;suggestedAction:string;message:string;evidenceReference:string|null}[]=[];
 const cart=input.products.flatMap(p=>p.ingredientIds);
 for(const a of input.allergies) {
  const match=(a.productId && input.products.some(p=>p.id===a.productId)) || (a.ingredientId && cart.includes(a.ingredientId)) || (a.drugClassId && input.memberships.some(m=>m.drugClassId===a.drugClassId && cart.includes(m.ingredientId)));
  if(match) alerts.push({ruleId:null,severity:a.severity||'HIGH',suggestedAction:'BLOCK',message:'พบรายการตรงกับประวัติแพ้ยา ต้องแก้รายการและประเมินใหม่',evidenceReference:a.rawName||null});
 }
 const all=new Set([...cart,...input.medicationIngredients]);
 for(const rule of input.rules) {
  if(rule.ruleType==='INTERACTION' && rule.ingredientAId && rule.ingredientBId && all.has(rule.ingredientAId) && all.has(rule.ingredientBId) && (cart.includes(rule.ingredientAId)||cart.includes(rule.ingredientBId))) alerts.push({ruleId:rule.id,severity:rule.severity,suggestedAction:rule.defaultAction,message:`พบกฎอันตรกิริยาที่ต้องประเมิน (${rule.id})`,evidenceReference:rule.evidenceReference});
 }
 for(const id of new Set(cart)) if(cart.filter(x=>x===id).length>1 || input.medicationIngredients.includes(id)) alerts.push({ruleId:null,severity:'MODERATE',suggestedAction:'REQUIRE_PHARMACIST_REVIEW',message:`พบสารสำคัญซ้ำ รหัส ${id}`,evidenceReference:null});
 return alerts;
}
