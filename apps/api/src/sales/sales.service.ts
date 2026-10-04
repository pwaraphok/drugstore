import { evaluateSafety } from '../clinical/evaluator';
import { IngredientClassMembership } from '../database/entities';
import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { d, money, qty, assertPositiveQuantity } from '../common/decimal';
import { IdempotencyService } from '../common/idempotency.service';
import { OutboxService } from '../common/outbox.service';
import {
  AllocationCost,
  CashShift,
  ClinicalAlert,
  ClinicalCheck,
  ClinicalDecision,
  DispensingRecord,
  InventoryLocation,
  KnowledgeRule,
  KnowledgeVersion,
  Patient,
  ProductLot,
  PatientAllergy,
  PatientMedication,
  PaymentAttempt,
  Refund,
  Pharmacist,
  PharmacistShift,
  User,
  Unit,
  Product,
  ProductIngredient,
  ProductPackage,
  ProductPrice,
  Sale,
  SaleItem,
  SaleItemAllocation,
  StockBalance,
  StockReservation,
  CashMovement,
} from '../database/entities';
import { AuthUser } from '../identity/identity.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventory: InventoryService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  private async nextInvoice(em: EntityManager, branchId: string): Promise<string> {
    return `INV-${randomUUID().replace(/-/g, '').slice(0,24)}`;
  }

  list(user:AuthUser) {return this.dataSource.manager.find(Sale,{where:{branchId:user.branchId},order:{id:'DESC'},take:100});}

  async cancel(user:AuthUser,id:string) {return this.dataSource.transaction(async em=>{
    const sale=await em.findOneOrFail(Sale,{where:{id,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
    if(sale.status==='COMPLETED')throw new UnprocessableEntityException('ใช้การคืนสินค้าสำหรับบิลที่ขายแล้ว');
    const payments=await em.find(PaymentAttempt,{where:{saleId:id,status:'SUCCEEDED'}});
    const refunds=payments.length?await em.find(Refund,{where:payments.map(p=>({originalPaymentId:String(p.id),status:'SUCCEEDED'}))}):[];
    if(payments.reduce((a,p)=>a.plus(p.appliedAmount||p.amount),d(0)).minus(refunds.reduce((a,r)=>a.plus(r.amount),d(0))).gt(0))throw new UnprocessableEntityException('บิลนี้มีการรับเงินแล้ว ต้องจัดการคืนเงินก่อน');
    await this.releaseReservations(em,sale);sale.status='CANCELLED';await em.save(sale);return this.getSale(em,id);
  });}

  async removeItem(user:AuthUser,id:string,itemId:string){return this.dataSource.transaction(async em=>{
    const sale=await em.findOneOrFail(Sale,{where:{id,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
    if(sale.status!=='DRAFT')throw new UnprocessableEntityException('แก้ไขได้เฉพาะบิลร่าง');
    await em.findOneOrFail(SaleItem,{where:{id:itemId,saleId:id}});await em.delete(SaleItem,{id:itemId,saleId:id});sale.cartVersion++;await this.recalcTotals(em,sale);await em.save(sale);return this.getSale(em,id);
  });}

  async createDraft(user: AuthUser, patientId?: string) {
    return this.dataSource.transaction(async (em) => {
      const patient=patientId?await em.findOneOrFail(Patient, {where:{id:patientId,branchId:user.branchId}}):null;
      const shift = await em.findOne(CashShift,{where:{cashierId:user.id,branchId:user.branchId,status:'OPEN'}});
      if (!shift) throw new UnprocessableEntityException('กรุณาเปิดกะเงินสดก่อนขาย');
      const sale = em.create(Sale, {
        branchId: user.branchId,
        createdBy: user.id,
        invoiceNumber: await this.nextInvoice(em, user.branchId),
        patientId: patientId ?? null,
        patientSnapshot: patient?{name:patient.name}:null,
        cashierId: user.id,
        pharmacistId: user.pharmacistId ?? null,
        shiftId: String(shift.id),
        status: 'DRAFT',
        cartVersion: 1,
      });
      return em.save(sale);
    });
  }

  async addItem(
    user: AuthUser,
    saleId: string,
    input: { productId: string; packageId: string; quantity: string; directions?: string },
  ) {
    return this.dataSource.transaction(async (em) => {
      const sale = await em.findOneOrFail(Sale, {
        where: { id: saleId as never, branchId: user.branchId },
        lock: { mode: 'pessimistic_write' },
      });
      if (sale.status !== 'DRAFT' || await em.count(PaymentAttempt,{where:{saleId,status:'SUCCEEDED'}})) {
        throw new UnprocessableEntityException({ code: 'SALE_LOCKED', message: 'Sale cannot be edited' });
      }
      const product = await em.findOneOrFail(Product, { where: { id: input.productId as never } });
      const pkg = await em.findOneOrFail(ProductPackage, { where: { id: input.packageId as never } });
      if (String(pkg.productId) !== String(product.id)) {
        throw new UnprocessableEntityException({ code: 'PRODUCT_MISMATCH', message: 'Package/product mismatch' });
      }
      if (!product.active || !pkg.active) throw new UnprocessableEntityException('สินค้าหรือหน่วยถูกปิดใช้งาน');
      assertPositiveQuantity(input.quantity, '0.000001');
      assertPositiveQuantity(d(input.quantity).mul(pkg.baseQuantity).toString(), product.quantityStep);
      const price = await em
        .createQueryBuilder(ProductPrice, 'p')
        .where('p.packageId = :pid', { pid: input.packageId })
        .andWhere('p.validFrom <= :now', { now: new Date() })
        .andWhere('(p.validTo IS NULL OR p.validTo > :now)', { now: new Date() })
        .orderBy('p.validFrom', 'DESC')
        .getOne();
      if (!price) {
        throw new UnprocessableEntityException({ code: 'NO_PRICE', message: 'No approved price' });
      }
      const conversion = pkg.baseQuantity;
      const quantityBase = qty(d(input.quantity).mul(d(conversion)));
      const lineTotal = money(d(input.quantity).mul(d(price.price)));
      const item = em.create(SaleItem, {
        saleId: String(sale.id),
        productId: String(product.id),
        packageId: String(pkg.id),
        quantity: input.quantity,
        conversionSnapshot: conversion,
        quantityBase,
        unitPrice: price.price,
        discountAmount: '0.00',
        taxAmount: '0.00',
        lineTotal,
        productSnapshot: {
          unitName: (await em.findOneOrFail(Unit,{where:{id:pkg.unitId}})).displayName,
          sku: product.sku,
          tradeName: product.tradeName,
          dosageForm: product.dosageForm,
          registrationNumber: product.registrationNumber,
        },
        directionsSnapshot: input.directions ?? null,
      });
      await em.save(item);
      sale.cartVersion += 1;
      await this.recalcTotals(em, sale);
      await this.releaseReservations(em, sale);
      sale.status = 'DRAFT';
      await em.save(sale);
      return this.getSale(em, String(sale.id));
    });
  }

  private async recalcTotals(em: EntityManager, sale: Sale) {
    const items = await em.find(SaleItem, { where: { saleId: String(sale.id) } });
    const subtotal = items.reduce((acc, i) => acc.plus(d(i.lineTotal)), d(0));
    sale.subtotal = money(subtotal);
    sale.discountTotal = money(items.reduce((acc, i) => acc.plus(d(i.discountAmount)), d(0)));
    sale.taxTotal = money(items.reduce((acc, i) => acc.plus(d(i.taxAmount)), d(0)));
    sale.grandTotal = money(subtotal.minus(d(sale.discountTotal)).plus(d(sale.taxTotal)));
    sale.version += 1;
  }

  async reserve(user: AuthUser, saleId: string) {
    return this.dataSource.transaction(async (em) => {
      const sale = await em.findOneOrFail(Sale, {
        where: { id: saleId as never, branchId: user.branchId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!['DRAFT', 'AWAITING_PAYMENT'].includes(sale.status)) {
        throw new UnprocessableEntityException({ code: 'SALE_LOCKED', message: 'Cannot reserve' });
      }
      await this.releaseReservations(em, sale);
      const items = await em.find(SaleItem, { where: { saleId: String(sale.id) } });
      if (!items.length) throw new UnprocessableEntityException('บิลไม่มีสินค้า');
      const minutes = Number(process.env.RESERVATION_MINUTES ?? 10);
      const expires = new Date(Date.now() + minutes * 60_000);
      for (const item of items) {
        const candidates = await this.inventory.fefoCandidates(em, String(item.productId), user.branchId, item.quantityBase);
        let remaining = d(item.quantityBase);
        const pick: { lotId: string; balanceId: string; qty: string }[] = [];
        for (const c of candidates) {
          if (remaining.lte(0)) break;
          const take = remaining.lt(d(c.available)) ? remaining : d(c.available);
          pick.push({ lotId: c.lotId, balanceId: c.balanceId, qty: qty(take) });
          remaining = remaining.minus(take);
        }
        if (remaining.gt(0)) {
          throw new UnprocessableEntityException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient sellable stock for product ${item.productId}`,
          });
        }
        const { lots, balances } = await this.inventory.lockLotsThenBalances(
          em,
          pick.map((p) => p.lotId),
          pick.map((p) => p.balanceId),
        );
        const locations = await em.find(InventoryLocation, { where: { branchId: user.branchId } });
        for (const p of pick) {
          const lot = lots.find((l) => String(l.id) === p.lotId)!;
          const bal = balances.find((b) => String(b.id) === p.balanceId)!;
          const loc = locations.find((l) => String(l.id) === String(bal.locationId))!;
          this.inventory.assertSellable(lot, bal, loc, new Date());
          if (d(this.inventory.available(bal)).lt(d(p.qty))) {
            throw new UnprocessableEntityException({ code: 'INSUFFICIENT_STOCK', message: 'Stock changed during reserve' });
          }
          bal.reserved = qty(d(bal.reserved).plus(d(p.qty)));
          bal.version += 1;
          await em.save(bal);
          const res = em.create(StockReservation, {
            saleId: String(sale.id),
            balanceId: String(bal.id),
            quantity: p.qty,
            status: 'ACTIVE',
            expiresAt: expires,
          });
          await em.save(res);
        }
      }
      sale.status = 'AWAITING_PAYMENT';
      await em.save(sale);
      return this.getSale(em, String(sale.id));
    });
  }

  private async releaseReservations(em: EntityManager, sale: Sale) {
    const rows = await em.find(StockReservation, { where: { saleId: String(sale.id), status: 'ACTIVE' } });
    if (!rows.length) return;
    const { balances } = await this.inventory.lockLotsThenBalances(
      em,
      (await em.find(StockBalance,{where:rows.map(r=>({id:r.balanceId}))})).map(b=>b.lotId),
      rows.map((r) => r.balanceId),
    );
    for (const r of rows) {
      const bal = balances.find((b) => String(b.id) === String(r.balanceId));
      if (bal) {
        bal.reserved = qty(d(bal.reserved).minus(d(r.quantity)));
        if (d(bal.reserved).lt(0)) bal.reserved = '0.000000';
        await em.save(bal);
      }
      r.status = 'RELEASED';
      await em.save(r);
    }
  }

  async clinicalCheck(user: AuthUser, saleId: string) {
    return this.dataSource.transaction(async em => {
      const sale=await em.findOneOrFail(Sale,{where:{id:saleId,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
      const items=await em.find(SaleItem,{where:{saleId}});
      if(!items.length) throw new UnprocessableEntityException('บิลไม่มีสินค้า');
      const kv=await em.findOne(KnowledgeVersion,{where:{},order:{id:'DESC'}});
      const patient=sale.patientId?await em.findOneOrFail(Patient,{where:{id:sale.patientId,branchId:user.branchId},lock:{mode:'pessimistic_read'}}):null;
      const allergies=patient?await em.find(PatientAllergy,{where:{patientId:String(patient.id)}}):[];
      const meds=patient?await em.find(PatientMedication,{where:{patientId:String(patient.id),activeStatus:true}}):[];
      const ids=[...new Set([...items.map(i=>i.productId),...meds.map(m=>m.productId).filter((x):x is string=>Boolean(x))])];
      const ingredients=await em.find(ProductIngredient,{where:ids.map(productId=>({productId}))});
      const memberships=await em.find(IngredientClassMembership);
      const rules=kv?await em.find(KnowledgeRule,{where:{knowledgeVersionId:String(kv.id)}}):[];
      const missing=['ฐานความรู้ยังไม่รับรองสำหรับใช้งานจริง: ต้องประเมินด้วยเภสัชกร'];
      if(!patient) missing.push('ไม่ได้ระบุผู้ป่วย');
      if(patient && ['UNKNOWN','NOT_ASKED'].includes(patient.allergyStatus)) missing.push('ยังไม่ยืนยันประวัติแพ้ยา');
      if(allergies.some(a=>!a.ingredientId&&!a.productId&&!a.drugClassId)) missing.push('ประวัติแพ้ยาที่ยังจับคู่ไม่ได้');
      if(items.some(i=>!ingredients.some(p=>p.productId===i.productId))) missing.push('สินค้าไม่มีข้อมูลสารสำคัญครบ');
      if(meds.some(m=>!m.productId&&!m.ingredientId)) missing.push('ประวัติยาปัจจุบันที่จับคู่ไม่ได้');
      const check=await em.save(em.create(ClinicalCheck,{saleId,cartVersion:sale.cartVersion,patientRecordVersion:patient?.recordVersion||0,inputHash:this.inputHash(sale,items,patient),knowledgeVersion:kv?.version||'NONE',executionStatus:'COMPLETED',coverageStatus:'PARTIAL',assessedAt:new Date(),missingInputs:missing}));
      const evaluated=evaluateSafety({products:items.map(i=>({id:i.productId,ingredientIds:ingredients.filter(p=>p.productId===i.productId).map(p=>p.ingredientId)})),allergies,memberships,medicationIngredients:meds.flatMap(m=>m.ingredientId?[m.ingredientId]:ingredients.filter(p=>p.productId===m.productId).map(p=>p.ingredientId)),rules});
      evaluated.push({ruleId:null,severity:'REVIEW',suggestedAction:'REQUIRE_PHARMACIST_REVIEW',message:missing.join(' • '),evidenceReference:null});
      const alerts=await em.save(evaluated.map(a=>em.create(ClinicalAlert,{...a,checkId:String(check.id)})));
      return {check,alerts,display:'ข้อมูลตรวจอัตโนมัติยังไม่ครบ ต้องให้เภสัชกรประเมินและบันทึกแหล่งข้อมูลก่อนจ่าย'};
    });
  }

  async decideAlert(user: AuthUser, checkId: string, alertId: string, action: string, reason: string) {
    if (!user.pharmacistId || !user.activeShiftId) {
      throw new UnprocessableEntityException({ code: 'PHARMACIST_REQUIRED', message: 'Pharmacist review required' });
    }
    if (!reason?.trim()) {
      throw new UnprocessableEntityException({ code: 'REASON_REQUIRED', message: 'Review reason is required' });
    }
    return this.dataSource.transaction(async (em) => {
      const check = await em.findOneOrFail(ClinicalCheck,{where:{id:checkId}});
      await em.findOneOrFail(Sale,{where:{id:check.saleId,branchId:user.branchId}});
      if (!['ACCEPT','BLOCK'].includes(action)) throw new UnprocessableEntityException('การตัดสินใจไม่ถูกต้อง');
      const alert = await em.findOneOrFail(ClinicalAlert, { where: { id: alertId as never, checkId } });
      if (alert.suggestedAction === 'BLOCK' && action !== 'BLOCK') {
        throw new UnprocessableEntityException({
          code: 'BLOCK_NO_OVERRIDE',
          message: 'BLOCK alerts cannot be overridden; change the cart or care plan and re-check',
        });
      }
      const decision = em.create(ClinicalDecision, {
        checkId,
        alertId,
        action,
        reason,
        actorId: user.id,
        decidedAt: new Date(),
      });
      return em.save(decision);
    });
  }

  async finalize(user: AuthUser, saleId: string, idempotencyKey: string, expectedCartVersion: number) {
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.dataSource.transaction(async (em) => {
          const sale = await em.findOneOrFail(Sale, {
            where: { id: saleId as never, branchId: user.branchId },
            lock: { mode: 'pessimistic_write' },
          });
          const started = await this.idempotency.begin(em, `sale.finalize:${user.branchId}:${saleId}`, idempotencyKey, {
            saleId,
            expectedCartVersion,
          });
          if (started.replay) return started.replay;
          if (sale.status === 'COMPLETED') {
            const response = await this.getSale(em, String(sale.id));
            if (started.request) await this.idempotency.complete(em, started.request, String(sale.id), response);
            return response;
          }
          if (sale.cartVersion !== expectedCartVersion) {
            throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Cart version mismatch' });
          }
          if (sale.status !== 'AWAITING_PAYMENT') {
            throw new UnprocessableEntityException({ code: 'SALE_NOT_PAYABLE', message: 'Sale is not awaiting payment' });
          }
          const payments = await em.find(PaymentAttempt, { where: { saleId: String(sale.id), status: 'SUCCEEDED' } });
          const refunds=payments.length?await em.find(Refund,{where:payments.map(p=>({originalPaymentId:String(p.id),status:'SUCCEEDED'}))}):[];
          const paid = payments.reduce((acc, p) => acc.plus(d(p.appliedAmount ?? p.amount)), d(0)).minus(refunds.reduce((a,r)=>a.plus(r.amount),d(0)));
          if (!paid.eq(d(sale.grandTotal))) {
            throw new UnprocessableEntityException({ code: 'UNPAID', message: 'Successful payments do not cover total' });
          }
          const check = await em.findOne(ClinicalCheck, {
            where: { saleId: String(sale.id), cartVersion: sale.cartVersion },
            order: { id: 'DESC' },
          });
          if (!check || check.executionStatus !== 'COMPLETED') {
            throw new UnprocessableEntityException({
              code: 'CLINICAL_CHECK_STALE',
              message: 'A current clinical check is required',
            });
          }
          if (!user.pharmacistId || !user.activeShiftId) throw new UnprocessableEntityException('เภสัชกรที่เปิดกะต้องยืนยันส่งมอบ');
          await em.findOneOrFail(PharmacistShift,{where:{id:user.activeShiftId,pharmacistId:user.pharmacistId,branchId:user.branchId,endedAt:IsNull()},lock:{mode:'pessimistic_read'}});
          const latestKnowledge = await em.findOne(KnowledgeVersion,{where:{},order:{id:'DESC'}});
          if (check.knowledgeVersion !== (latestKnowledge?.version || 'NONE')) throw new UnprocessableEntityException('ฐานความรู้เปลี่ยน กรุณาตรวจใหม่');
          if (sale.patientId) {
            const patient = await em.findOneOrFail(Patient, { where: { id: sale.patientId as never,branchId:user.branchId },lock:{mode:'pessimistic_read'} });
            if (patient.recordVersion !== check.patientRecordVersion) {
              throw new UnprocessableEntityException({
                code: 'CLINICAL_CHECK_STALE',
                message: 'Patient record changed; re-run clinical check',
              });
            }
          }
          const alerts = await em.find(ClinicalAlert, { where: { checkId: String(check.id) } });
          const decisions = await em.find(ClinicalDecision, { where: { checkId: String(check.id) } });
          for (const alert of alerts) {
            if (alert.suggestedAction === 'BLOCK') {
              throw new UnprocessableEntityException({
                code: 'CLINICAL_BLOCK',
                message: 'Unresolved BLOCK alert',
              });
            }
            if (alert.suggestedAction === 'REQUIRE_PHARMACIST_REVIEW') {
              const decided = decisions.find((d0) => String(d0.alertId) === String(alert.id) && d0.action === 'ACCEPT');
              if (!decided) {
                throw new UnprocessableEntityException({
                  code: 'PHARMACIST_REVIEW_REQUIRED',
                  message: 'Pharmacist review required',
                });
              }
            }
          }
          const items = await em.find(SaleItem, { where: { saleId: String(sale.id) } });
          const reservations = await em.find(StockReservation, { where: { saleId: String(sale.id), status: 'ACTIVE' } });
          if (!reservations.length || reservations.some((r) => r.expiresAt < new Date())) {
            throw new UnprocessableEntityException({
              code: 'RESERVATION_EXPIRED',
              message: 'Reservation expired; re-allocate before finalize',
            });
          }
          const balanceIds = reservations.map((r) => r.balanceId);
          const prelim = await em.find(StockBalance, { where: balanceIds.map((id) => ({ id: id as never })) });
          const { lots, balances } = await this.inventory.lockLotsThenBalances(
            em,
            prelim.map((b) => String(b.lotId)),
            balanceIds,
          );
          const locations = await em.find(InventoryLocation, { where: { branchId: user.branchId } });
          const now = new Date();
          const remainingByRes = new Map(reservations.map((r) => [String(r.id), d(r.quantity)]));
          for (const item of items) {
            let remaining = d(item.quantityBase);
            for (const r of reservations) {
              if (remaining.lte(0)) break;
              const left = remainingByRes.get(String(r.id));
              if (!left || left.lte(0)) continue;
              const bal = balances.find((b) => String(b.id) === String(r.balanceId));
              if (!bal || String(bal.productId) !== String(item.productId)) continue;
              const loc = locations.find((l) => String(l.id) === String(bal.locationId));
              const lot = lots.find((l) => String(l.id) === String(bal.lotId));
              if (!loc || !lot) continue;
              this.inventory.assertSellable(lot, bal, loc, now);
              const take = remaining.lt(left) ? remaining : left;
              const alloc = em.create(SaleItemAllocation, {
                saleItemId: String(item.id),
                productId: String(item.productId),
                lotId: String(bal.lotId),
                balanceId: String(bal.id),
                quantityBase: qty(take),
              });
              await em.save(alloc);
              await this.inventory.applyMovement(em, {
                branchId: user.branchId,
                balance: bal,
                quantityDelta: qty(take.neg()),
                reserveDelta: qty(take.neg()),
                movementType: 'SALE',
                documentType: 'SALE_ITEM_ALLOCATION',
                documentId: String(sale.id),
                documentLineId: String(alloc.id),
                actorId: user.id,
                occurredAt: now,
              });
              const costs = await this.inventory.consumeCostLayers(em, String(bal.lotId), qty(take), String(alloc.id));
              for (const c of costs) {
                await em.save(
                  em.create(AllocationCost, {
                    allocationId: String(alloc.id),
                    costLayerId: c.costLayerId,
                    quantity: c.quantity,
                    unitCostSnapshot: c.unitCostSnapshot,
                  }),
                );
              }
              remaining = remaining.minus(take);
              remainingByRes.set(String(r.id), left.minus(take));
              if (remainingByRes.get(String(r.id))?.lte(0)) {
                r.status = 'CONSUMED';
                await em.save(r);
              }
            }
            if (remaining.gt(0)) {
              throw new UnprocessableEntityException({
                code: 'INSUFFICIENT_STOCK',
                message: 'Unable to allocate full quantity; rolling back',
              });
            }
            await em.save(
              em.create(DispensingRecord, {
                saleItemId: String(item.id),
                directionsSnapshot: item.directionsSnapshot,
                pharmacistId: user.pharmacistId ?? sale.pharmacistId,
                releasedAt: now,
              }),
            );
          }
          sale.pharmacistId = user.pharmacistId!;
          sale.status = 'COMPLETED';
          sale.completedAt = new Date();
          const pharmacist=await em.findOneOrFail(Pharmacist,{where:{id:user.pharmacistId!}});
          sale.pharmacistSnapshot=pharmacist.name+' ('+pharmacist.licenseNumber+')';
          await em.save(sale);
          await this.outbox.enqueue(em, 'SALE_COMPLETED', { saleId: String(sale.id) }, user.branchId);
          await this.audit.record(em, {
            actorId: user.id,
            action: 'SALE_FINALIZED',
            entityType: 'sale',
            entityId: String(sale.id),
            branchId: user.branchId,
          });
          const response = await this.getSale(em, String(sale.id));
          if (started.request) await this.idempotency.complete(em, started.request, String(sale.id), response);
          return response;
        });
      } catch (err) {
        lastErr = err;
        const msg = String((err as Error)?.message ?? '');
        if (msg.includes('Deadlock') && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async getSale(em: EntityManager, id: string) {
    const sale = await em.findOneOrFail(Sale, { where: { id: id as never } });
    const items = await em.find(SaleItem, { where: { saleId: id } });
    const allocations = items.length
      ? await em.find(SaleItemAllocation, { where: items.map((i) => ({ saleItemId: String(i.id) })) })
      : [];
    const payments = await em.find(PaymentAttempt, { where: { saleId: id } });
    const check=await em.findOne(ClinicalCheck,{where:{saleId:id,cartVersion:sale.cartVersion},order:{id:'DESC'}});
    const alerts=check?await em.find(ClinicalAlert,{where:{checkId:String(check.id)}}):[];
    const decisions=check?await em.find(ClinicalDecision,{where:{checkId:String(check.id)}}):[];
    const refunds=payments.length?await em.find(Refund,{where:payments.map(p=>({originalPaymentId:String(p.id)}))}):[];
    return { sale, items, allocations, payments, refunds, check, alerts, decisions };
  }

  async loadSale(id: string, branchId: string) {
    return this.dataSource.transaction((em) => {
      return em.findOneOrFail(Sale,{where:{id,branchId}}).then(() => this.getSale(em,id));
    });
  }

  async openCashShift(user: AuthUser, openingFloat: string) {
    return this.dataSource.transaction(async (em) => {
      await em.findOneOrFail(User,{where:{id:user.id},lock:{mode:'pessimistic_write'}});
      if (d(openingFloat).lt(0)||d(openingFloat).decimalPlaces()>2) throw new UnprocessableEntityException('เงินเปิดกะต้องไม่ติดลบ');
      const existing = await em.findOne(CashShift, {
        where: { cashierId: user.id, branchId: user.branchId, status: 'OPEN' },
      });
      if (existing) return existing;
      const shift = em.create(CashShift, {
        branchId: user.branchId,
        createdBy: user.id,
        cashierId: user.id,
        openingFloat: money(openingFloat),
        status: 'OPEN',
      });
      return em.save(shift);
    });
  }

  async closeCashShift(user: AuthUser, countedCash: string, reason?: string) {
    return this.dataSource.transaction(async (em) => {
      if (d(countedCash).lt(0)||d(countedCash).decimalPlaces()>2) throw new UnprocessableEntityException('ยอดนับต้องไม่ติดลบ');
      const shift = await em.findOneOrFail(CashShift, {
        where: { cashierId: user.id, branchId: user.branchId, status: 'OPEN' },
        lock: { mode: 'pessimistic_write' },
      });
      const movements = await em.find(CashMovement,{where:{cashShiftId:String(shift.id)}});
      const expected = movements.reduce((a,m)=>a.plus(m.amount),d(shift.openingFloat));
      shift.expectedCash = money(expected);
      shift.countedCash = money(countedCash);
      shift.variance = money(d(countedCash).minus(expected));
      shift.status = 'CLOSED';
      shift.closedAt = new Date();
      if (!d(shift.variance).eq(0) && !reason) {
        throw new UnprocessableEntityException({ code: 'VARIANCE_REASON_REQUIRED', message: 'Cash variance requires a reason' });
      }
      await this.audit.record(em, {
        actorId: user.id,
        action: 'CASH_SHIFT_CLOSED',
        entityType: 'cash_shift',
        entityId: String(shift.id),
        branchId: user.branchId,
        reason: reason ?? null,
        after: { expected: shift.expectedCash, counted: shift.countedCash, variance: shift.variance },
      });
      return em.save(shift);
    });
  }


  async expireReservations() {
    const expired = await this.dataSource.query("SELECT DISTINCT sale_id FROM stock_reservations WHERE status='ACTIVE' AND expires_at <= UTC_TIMESTAMP() LIMIT 50");
    for(const row of expired) await this.dataSource.transaction(async em=>{
      const sale=await em.findOneOrFail(Sale,{where:{id:String(row.sale_id)},lock:{mode:'pessimistic_write'}});
      const active=await em.find(StockReservation,{where:{saleId:String(sale.id),status:'ACTIVE'}});
      if(active.some(r=>r.expiresAt<=new Date()))await this.releaseReservations(em,sale);
    });
  }

  private inputHash(sale: Sale, items: SaleItem[], patient: Patient | null): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          saleId: String(sale.id),
          cartVersion: sale.cartVersion,
          patientId: sale.patientId,
          patientVer: patient?.recordVersion ?? 0,
          items: items.map((i) => ({ p: i.productId, q: i.quantityBase, d: i.directionsSnapshot })),
        }),
      )
      .digest('hex');
  }
}
