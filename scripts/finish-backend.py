from pathlib import Path
r=Path(__file__).resolve().parents[1]/'apps/api/src'
def change(p,a,b):
 p=r/p;s=p.read_text(encoding='utf-8')
 if a not in s: raise Exception('anchor '+str(p)+': '+a[:60])
 p.write_text(s.replace(a,b),encoding='utf-8')
p=r/'inventory/inventory.service.ts';s=p.read_text();start=s.index('        const reservations = await em.find(StockReservation,',s.index('  async createRecall'))
end=s.index('      }\n      return recall;',start)
s=s[:start]+"        // Reservations remain until released under the sale lock; blocked lots cannot finalize.\n"+s[end:]
s=s.replace("    return this.dataSource.transaction(async (em) => {\n      const recall", "    if (!reason?.trim() || !Array.isArray(lotIds) || !lotIds.length) throw new UnprocessableEntityException('ระบุล็อตและเหตุผล');\n    return this.dataSource.transaction(async (em) => {\n      for (const lotId of lotIds) {\n        const scoped = await em.query('SELECT b.id FROM stock_balances b JOIN inventory_locations l ON l.id=b.location_id WHERE b.lot_id=? AND l.branch_id=? LIMIT 1',[lotId,user.branchId]);\n        if (!scoped.length) throw new ForbiddenException('ไม่พบล็อตในสาขา');\n      }\n      const recall")
s=s.replace('      return recall;',"      await this.audit.record(em,{actorId:user.id,branchId:user.branchId,action:'LOT_RECALLED',entityType:'recall',entityId:String(recall.id),reason});\n      return recall;")
p.write_text(s,encoding='utf-8')
p=r/'sales/sales.service.ts';s=p.read_text();a=s.index('          const started = await this.idempotency.begin',s.index('  async finalize'));b=s.index("          if (sale.status === 'COMPLETED')",a)
block=s[a:b];split=block.index('          const sale =');prefix=block[:split];lock=block[split:];s=s[:a]+lock+prefix+s[b:]
s=s.replace("      rows.map((r) => r.balanceId),", "      rows.map((r) => r.balanceId),")
s=s.replace("      [],\n      rows.map", "      (await em.find(StockBalance,{where:rows.map(r=>({id:r.balanceId}))})).map(b=>b.lotId),\n      rows.map")
s=s.replace("            const patient = await em.findOneOrFail(Patient, { where: { id: sale.patientId as never } });", "            const patient = await em.findOneOrFail(Patient, { where: { id: sale.patientId as never,branchId:user.branchId },lock:{mode:'pessimistic_read'} });")
insert="""
  async expireReservations() {
    const expired = await this.dataSource.query("SELECT DISTINCT sale_id FROM stock_reservations WHERE status='ACTIVE' AND expires_at <= UTC_TIMESTAMP() LIMIT 50");
    for(const row of expired) await this.dataSource.transaction(async em=>{
      const sale=await em.findOneOrFail(Sale,{where:{id:String(row.sale_id)},lock:{mode:'pessimistic_write'}});
      const active=await em.find(StockReservation,{where:{saleId:String(sale.id),status:'ACTIVE'}});
      if(active.some(r=>r.expiresAt<=new Date()))await this.releaseReservations(em,sale);
    });
  }
"""
s=s.replace('  private inputHash(',insert+'\n  private inputHash(')
p.write_text(s,encoding='utf-8')
change('clinical/clinical.service.ts',"import { Injectable }", "import { Injectable, UnprocessableEntityException }" )
change('clinical/clinical.service.ts',"import { Repository }", "import { randomUUID } from 'crypto';\nimport { Repository }")
change('clinical/clinical.service.ts',"    const count = await this.patients.count({ where: { branchId: user.branchId } });", "    if (!input.name?.trim()) throw new UnprocessableEntityException('ระบุชื่อผู้รับบริการ');")
change('clinical/clinical.service.ts',"`HN${String(count + 1).padStart(6, '0')}`", "`HN${randomUUID().slice(0,12)}`")
# Allergy update must bump version in the same transaction so finalize cannot observe half an update.
p=r/'clinical/clinical.service.ts';s=p.read_text();a=s.index('    const patient =',s.index('  async addAllergy'));b=s.index('\n  async addEncounter',a)
s=s[:a]+"""    if(!input.rawName?.trim() && !input.ingredientId) throw new UnprocessableEntityException('ระบุประวัติแพ้ยา');
    return this.patients.manager.transaction(async em=>{
      const patient=await em.findOneOrFail(Patient,{where:{id:patientId,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
      const row=await em.save(em.create(PatientAllergy,{patientId,targetType:input.ingredientId?'INGREDIENT':'RAW',ingredientId:input.ingredientId||null,rawName:input.rawName||null,reaction:input.reaction||null,severity:input.severity||null,verificationStatus:input.ingredientId?'VERIFIED':'UNMATCHED',reporter:user.displayName}));
      patient.allergyStatus='KNOWN_ALLERGIES';patient.recordVersion++;patient.allergyStatusConfirmedBy=user.id;patient.allergyStatusConfirmedAt=new Date();await em.save(patient);return row;
    });
  }
"""+s[b:]
s=s.replace('    const row = this.encounters.create({',"    await this.patients.findOneByOrFail({id:input.patientId,branchId:user.branchId});\n    const row = this.encounters.create({")
p.write_text(s,encoding='utf-8')
# Prevent unvalidated regulatory exports being represented as complete reports.
change('reporting/reporting.service.ts',"import { Injectable }", "import { Injectable, UnprocessableEntityException }")
change('reporting/reporting.service.ts',"    const em = this.dataSource.manager;", "    if (process.env.REGULATORY_EXPORT_ENABLED !== 'reviewed') throw new UnprocessableEntityException('รายงานทางการยังไม่เปิด ต้องตรวจ mapping และแม่แบบก่อน');\n    const em = this.dataSource.manager;")
# Ensure print contents cannot run user-supplied markup.
change('printing/printing.service.ts',"import { Injectable }", "import { Injectable, UnprocessableEntityException }")
change('printing/printing.service.ts',"{ id: saleId as never });", "{ id: saleId as never, branchId:user.branchId, status:'COMPLETED' });")
change('printing/printing.service.ts',"    const html = items", "    const escape=(s:unknown)=>String(s??'').replace(/[&<>\\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;',\"'\":'&#39;'}[c]!));\n    const html = items")
change('printing/printing.service.ts',"${(item.productSnapshot as { tradeName?: string }).tradeName ?? ''}", "${escape((item.productSnapshot as { tradeName?: string }).tradeName)}")
change('printing/printing.service.ts',"${item.directionsSnapshot ?? ''}", "${escape(item.directionsSnapshot)}")
change('printing/printing.service.ts',"new Date().toLocaleString", "new Date(sale.createdAt).toLocaleString")
change('printing/printing.service.ts','height:50mm','min-height:50mm')
change('printing/printing.service.ts',"async mark(id: string, state: string)","async mark(id: string, state: string, branchId:string)")
change('printing/printing.service.ts',"    const job = await this.jobs.findOneByOrFail({ id: id as never });", "    if (!['SENT','CONFIRMED','FAILED','UNKNOWN'].includes(state)) throw new UnprocessableEntityException('สถานะพิมพ์ไม่ถูกต้อง');\n    const job = await this.jobs.findOneByOrFail({ id: id as never, branchId });")
change('printing/printing.controller.ts',"state(@Param('id') id: string,", "state(@CurrentUser() user: AuthUser, @Param('id') id: string,")
change('printing/printing.controller.ts',"this.printing.mark(id, body.state)","this.printing.mark(id, body.state, user.branchId)")
change('outbox.worker.ts',"import { OutboxEvent }", "import { SalesService } from './sales/sales.service';\nimport { OutboxEvent }")
change('outbox.worker.ts',"private readonly dataSource: DataSource) {}", "private readonly dataSource: DataSource, private readonly sales: SalesService) {}")
change('outbox.worker.ts',"    await this.dataSource.transaction", "    await this.sales.expireReservations();\n    await this.dataSource.transaction")
change('outbox.worker.ts',"event.state = 'PROCESSED';", "event.state = event.eventType === 'PRINT_JOB' ? 'WAITING_CLIENT' : 'ACKNOWLEDGED';")
