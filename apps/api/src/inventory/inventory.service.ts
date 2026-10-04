import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { d, qty, assertPositiveQuantity, assertNonNegative } from '../common/decimal';
import { Supplier } from '../database/entities';
import { IdempotencyService } from '../common/idempotency.service';
import {
  CostLayer,
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryLocation,
  Product,
  ProductLot,
  ProductPackage,
  PurchaseOrder,
  PurchaseOrderItem,
  Recall,
  RecallLot,
  StockBalance,
  StockMovement,
  StockReservation,
} from '../database/entities';
import { AuthUser } from '../identity/identity.service';

export type FefoCandidate = {
  lotId: string;
  balanceId: string;
  locationId: string;
  available: string;
  usableUntilExclusive: string;
  receivedAt: string;
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async withTransaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }

  available(balance: StockBalance): string {
    return qty(d(balance.onHand).minus(d(balance.reserved)));
  }

  async lockLotsThenBalances(em: EntityManager, lotIds: string[], balanceIds: string[]): Promise<{
    lots: ProductLot[];
    balances: StockBalance[];
  }> {
    const uniqueLots = [...new Set(lotIds)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    const uniqueBalances = [...new Set(balanceIds)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    const lots = uniqueLots.length
      ? await em
          .createQueryBuilder(ProductLot, 'lot')
          .setLock('pessimistic_write')
          .whereInIds(uniqueLots)
          .orderBy('lot.id', 'ASC')
          .getMany()
      : [];
    const balances = uniqueBalances.length
      ? await em
          .createQueryBuilder(StockBalance, 'b')
          .setLock('pessimistic_write')
          .whereInIds(uniqueBalances)
          .orderBy('b.id', 'ASC')
          .getMany()
      : [];
    return { lots, balances };
  }

  assertSellable(lot: ProductLot, balance: StockBalance, location: InventoryLocation, now: Date): void {
    if (lot.productId !== balance.productId) {
      throw new UnprocessableEntityException({ code: 'PRODUCT_MISMATCH', message: 'Lot/balance product mismatch' });
    }
    if (lot.globalStatus !== 'RELEASED') {
      throw new UnprocessableEntityException({ code: 'LOT_NOT_SELLABLE', message: 'Lot is not released' });
    }
    if (balance.conditionStatus !== 'SELLABLE') {
      throw new UnprocessableEntityException({ code: 'LOT_NOT_SELLABLE', message: 'Stock is not sellable' });
    }
    if (location.status !== 'OPEN'||location.locationType==='QUARANTINE') {
      throw new UnprocessableEntityException({ code: 'LOCATION_CLOSED', message: 'Location is not open' });
    }
    if (lot.usableUntilExclusive <= this.businessDate(now)) {
      throw new UnprocessableEntityException({ code: 'EXPIRED', message: 'Lot past usable date' });
    }
  }

  businessDate(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  }

  async fefoCandidates(em: EntityManager, productId: string, branchId: string, neededBase: string): Promise<FefoCandidate[]> {
    const rows = await em.query(
      `SELECT b.id AS balanceId, b.lot_id AS lotId, b.location_id AS locationId,
              b.on_hand AS onHand, b.reserved AS reserved,
              l.usable_until_exclusive AS usableUntilExclusive,
              COALESCE(MIN(c.received_at), l.id) AS receivedAt
       FROM stock_balances b
       INNER JOIN product_lots l ON l.id = b.lot_id
       INNER JOIN inventory_locations loc ON loc.id = b.location_id
       LEFT JOIN cost_layers c ON c.lot_id = l.id
       WHERE b.product_id = ? AND loc.branch_id = ?
         AND l.global_status = 'RELEASED'
         AND b.condition_status = 'SELLABLE'
         AND loc.status = 'OPEN' AND loc.location_type <> 'QUARANTINE'
         AND l.usable_until_exclusive > ?
       GROUP BY b.id, b.lot_id, b.location_id, b.on_hand, b.reserved, l.usable_until_exclusive, l.id
       ORDER BY l.usable_until_exclusive ASC, receivedAt ASC, l.id ASC`,
      [productId, branchId, this.businessDate(new Date())],
    );
    const out: FefoCandidate[] = [];
    let remaining = d(neededBase);
    for (const r of rows) {
      const available = d(r.onHand).minus(d(r.reserved));
      if (available.lte(0)) continue;
      out.push({
        lotId: String(r.lotId),
        balanceId: String(r.balanceId),
        locationId: String(r.locationId),
        available: qty(available),
        usableUntilExclusive: r.usableUntilExclusive,
        receivedAt: String(r.receivedAt),
      });
      remaining = remaining.minus(available);
      if (remaining.lte(0)) break;
    }
    return out;
  }

  async applyMovement(
    em: EntityManager,
    input: {
      branchId: string;
      balance: StockBalance;
      quantityDelta: string;
      movementType: string;
      documentType: string;
      documentId: string;
      documentLineId: string;
      movementLeg?: string;
      actorId?: string;
      occurredAt?: Date;
      costSnapshot?: string | null;
      reserveDelta?: string;
    },
  ): Promise<StockMovement> {
    const delta = d(input.quantityDelta);
    const newOnHand = d(input.balance.onHand).plus(delta);
    const reserveDelta = input.reserveDelta ? d(input.reserveDelta) : d(0);
    const newReserved = d(input.balance.reserved).plus(reserveDelta);
    if (newOnHand.lt(0) || newReserved.lt(0) || newReserved.gt(newOnHand)) {
      throw new UnprocessableEntityException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Stock invariant would be violated',
      });
    }
    input.balance.onHand = qty(newOnHand);
    input.balance.reserved = qty(newReserved);
    input.balance.version += 1;
    await em.save(input.balance);
    const mv = em.create(StockMovement, {
      branchId: input.branchId,
      balanceId: String(input.balance.id),
      quantityDelta: qty(delta),
      movementType: input.movementType,
      businessDocumentType: input.documentType,
      businessDocumentId: input.documentId,
      businessDocumentLineId: input.documentLineId,
      movementLeg: input.movementLeg ?? 'POST',
      actorId: input.actorId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      postedAt: new Date(),
      costSnapshot: input.costSnapshot ?? null,
    });
    return em.save(mv);
  }

  async consumeCostLayers(
    em: EntityManager,
    lotId: string,
    quantityBase: string,
    allocationId: string,
  ): Promise<{ costLayerId: string; quantity: string; unitCostSnapshot: string }[]> {
    const layers = await em
      .createQueryBuilder(CostLayer, 'c')
      .setLock('pessimistic_write')
      .where('c.lotId = :lotId', { lotId })
      .andWhere('c.remainingQuantity > 0')
      .orderBy('c.receivedAt', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .getMany();
    let remaining = d(quantityBase);
    const used: { costLayerId: string; quantity: string; unitCostSnapshot: string }[] = [];
    for (const layer of layers) {
      if (remaining.lte(0)) break;
      const take = DecimalMin(d(layer.remainingQuantity), remaining);
      layer.remainingQuantity = qty(d(layer.remainingQuantity).minus(take));
      await em.save(layer);
      used.push({
        costLayerId: String(layer.id),
        quantity: qty(take),
        unitCostSnapshot: layer.unitCost,
      });
      remaining = remaining.minus(take);
    }
    if (remaining.gt(0)) {
      throw new UnprocessableEntityException({
        code: 'COST_LAYER_SHORTAGE',
        message: 'Cost layers do not cover allocated quantity',
      });
    }
    void allocationId;
    return used;
  }

  async restoreCostFromAllocation(
    em: EntityManager,
    costs: { costLayerId: string; quantity: string }[],
  ): Promise<void> {
    for (const c of costs) {
      const layer = await em.findOneOrFail(CostLayer, {
        where: { id: c.costLayerId as never },
        lock: { mode: 'pessimistic_write' },
      });
      layer.remainingQuantity = qty(d(layer.remainingQuantity).plus(d(c.quantity)));
      await em.save(layer);
    }
  }

  async receiveGoods(
    user: AuthUser,
    input: {
      purchaseOrderId?: string;
      supplierId: string;
      supplierDocument?: string;
      reasonNoPo?: string;
      items: {
        purchaseOrderItemId?: string;
        productId: string;
        packageId: string;
        quantity: string;
        lotNumber: string;
        expiryRaw: string;
        expiryPrecision: 'DAY' | 'MONTH';
        usableUntilExclusive: string;
        unitCost: string;
        inspectPassed: boolean;
        locationId: string;
      }[];
    },
    idempotencyKey?: string,
  ) {
    return this.dataSource.transaction(async (em) => {
      if (!Array.isArray(input.items) || !input.items.length) throw new UnprocessableEntityException('กรุณาระบุรายการรับเข้า');
      await em.findOneOrFail(Supplier,{where:{id:input.supplierId,branchId:user.branchId,active:true},lock:{mode:'pessimistic_write'}});
      const request = await this.idempotency.begin(em,`receive:${user.branchId}`,idempotencyKey,input);
      if(request.replay) return request.replay;
      let po: PurchaseOrder | null = null;
      if (input.purchaseOrderId) {
        po = await em.findOneOrFail(PurchaseOrder, {
          where: { id: input.purchaseOrderId as never, branchId: user.branchId },
          lock: { mode: 'pessimistic_write' },
        });
        if(String(po.supplierId)!==String(input.supplierId))throw new UnprocessableEntityException('ผู้จำหน่ายไม่ตรงใบสั่งซื้อ');
        if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
          throw new UnprocessableEntityException({ code: 'PO_NOT_RECEIVABLE', message: 'PO cannot be received' });
        }
      } else if (!input.reasonNoPo) {
        throw new UnprocessableEntityException({ code: 'NO_PO_REASON_REQUIRED', message: 'Receiving without PO requires a reason' });
      }

      const receipt = em.create(GoodsReceipt, {
        branchId: user.branchId,
        createdBy: user.id,
        purchaseOrderId: po ? String(po.id) : null,
        supplierId: input.supplierId,
        supplierDocument: input.supplierDocument ?? null,
        receivedAt: new Date(),
        inspectorId: user.id,
        status: 'POSTED',
        reasonNoPo: input.reasonNoPo ?? null,
      });
      await em.save(receipt);

      for (const item of input.items) {
        if(po&&!item.purchaseOrderItemId)throw new UnprocessableEntityException('ต้องอ้างอิงรายการใบสั่งซื้อ');
        if(!po&&item.purchaseOrderItemId)throw new UnprocessableEntityException('ต้องระบุใบสั่งซื้อ');
        assertPositiveQuantity(item.quantity, '0.000001');
        assertNonNegative(item.unitCost,'cost');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.usableUntilExclusive) || !item.lotNumber?.trim()) throw new UnprocessableEntityException('ระบุล็อตและวันตัดสิทธิ์ขายให้ถูกต้อง');
        const product = await em.findOneOrFail(Product, { where: { id: item.productId as never }, lock:{mode:'pessimistic_write'} });
        const pkg = await em.findOneOrFail(ProductPackage, { where: { id: item.packageId as never } });
        if (String(pkg.productId) !== String(product.id)) {
          throw new UnprocessableEntityException({ code: 'PRODUCT_MISMATCH', message: 'Package does not belong to product' });
        }
        assertPositiveQuantity(d(item.quantity).mul(pkg.baseQuantity).toString(), product.quantityStep);
        const qtyBase = qty(d(item.quantity).mul(d(pkg.baseQuantity)));
        const condition = item.inspectPassed ? 'SELLABLE' : 'QUARANTINED';
        let lot = await em.findOne(ProductLot, {
          where: { productId: item.productId, lotNumber: item.lotNumber, expiryRaw: item.expiryRaw },
        });
        if (!lot) {
          lot = em.create(ProductLot, {
            productId: item.productId,
            lotNumber: item.lotNumber,
            expiryRaw: item.expiryRaw,
            expiryPrecision: item.expiryPrecision,
            usableUntilExclusive: item.usableUntilExclusive,
            globalStatus: 'RELEASED',
          });
          await em.save(lot);
        } else if (lot.usableUntilExclusive !== item.usableUntilExclusive) {
          throw new UnprocessableEntityException({
            code: 'LOT_IDENTITY_CONFLICT',
            message: 'Lot identity conflict requires review',
          });
        }
        const location = await em.findOneOrFail(InventoryLocation, { where: { id: item.locationId as never, branchId:user.branchId, status:'OPEN' } });
        if(condition==='SELLABLE'&&location.locationType==='QUARANTINE')throw new UnprocessableEntityException('ตำแหน่งกักกันรับเป็นสินค้าพร้อมขายไม่ได้');
        let balance = await em.findOne(StockBalance, {
          where: { lotId: String(lot.id), locationId: item.locationId, conditionStatus: condition },
        });
        if (!balance) {
          balance = em.create(StockBalance, {
            productId: item.productId,
            lotId: String(lot.id),
            locationId: item.locationId,
            conditionStatus: condition,
            onHand: '0',
            reserved: '0',
            version: 1,
          });
          await em.save(balance);
        }
        const { balances } = await this.lockLotsThenBalances(em, [String(lot.id)], [String(balance.id)]);
        const lockedBalance = balances[0];
        const gri = em.create(GoodsReceiptItem, {
          goodsReceiptId: String(receipt.id),
          purchaseOrderItemId: item.purchaseOrderItemId ?? null,
          productId: item.productId,
          lotId: String(lot.id),
          locationId: item.locationId,
          receivedQuantityBase: qtyBase,
          unitCost: item.unitCost,
          conditionStatus: condition,
        });
        await em.save(gri);
        await this.applyMovement(em, {
          branchId: user.branchId,
          balance: lockedBalance,
          quantityDelta: qtyBase,
          movementType: 'RECEIPT',
          documentType: 'GOODS_RECEIPT_ITEM',
          documentId: String(receipt.id),
          documentLineId: String(gri.id),
          actorId: user.id,
          costSnapshot: item.unitCost,
        });
        const layer = em.create(CostLayer, {
          goodsReceiptItemId: String(gri.id),
          lotId: String(lot.id),
          receivedQuantity: qtyBase,
          remainingQuantity: qtyBase,
          unitCost: item.unitCost,
          receivedAt: receipt.receivedAt,
        });
        await em.save(layer);
        if (item.purchaseOrderItemId && po) {
          const poi = await em.findOneOrFail(PurchaseOrderItem, {
            where: { id: item.purchaseOrderItemId as never, purchaseOrderId:String(po.id), productId:item.productId, packageId:item.packageId },
            lock: { mode: 'pessimistic_write' },
          });
          poi.receivedQuantity = qty(d(poi.receivedQuantity).plus(d(item.quantity)));
          if (d(poi.receivedQuantity).gt(d(poi.orderedQuantity))) {
            throw new UnprocessableEntityException({ code: 'OVER_RECEIPT', message: 'Receipt exceeds PO cap; approval required' });
          }
          await em.save(poi);
        }
        void location;
      }
      if (po) {
        const items = await em.find(PurchaseOrderItem, { where: { purchaseOrderId: String(po.id) } });
        const all = items.every((i) => d(i.receivedQuantity).gte(d(i.orderedQuantity)));
        const any = items.some((i) => d(i.receivedQuantity).gt(0));
        po.status = all ? 'RECEIVED' : any ? 'PARTIALLY_RECEIVED' : po.status;
        await em.save(po);
      }
      await this.audit.record(em, {
        actorId: user.id,
        action: 'GOODS_RECEIPT_POSTED',
        entityType: 'goods_receipt',
        entityId: String(receipt.id),
        branchId: user.branchId,
      });
      await this.idempotency.complete(em,request.request!,String(receipt.id),receipt);
      return receipt;
    });
  }

  async createRecall(user: AuthUser, reason: string, lotIds: string[]) {
    if (!user.permissions.includes('recall.manage') && !user.roles.includes('PHARMACIST') && !user.roles.includes('MANAGER')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permission' });
    }
    if (!reason?.trim() || !Array.isArray(lotIds) || !lotIds.length) throw new UnprocessableEntityException('ระบุล็อตและเหตุผล');
    return this.dataSource.transaction(async (em) => {
      for (const lotId of lotIds) {
        const scoped = await em.query('SELECT b.id FROM stock_balances b JOIN inventory_locations l ON l.id=b.location_id WHERE b.lot_id=? AND l.branch_id=? LIMIT 1',[lotId,user.branchId]);
        if (!scoped.length) throw new ForbiddenException('ไม่พบล็อตในสาขา');
      }
      const recall = em.create(Recall, {
        branchId: user.branchId,
        createdBy: user.id,
        reason,
        source: 'INTERNAL',
        status: 'OPEN',
      });
      await em.save(recall);
      const { lots } = await this.lockLotsThenBalances(em, lotIds, []);
      for (const lot of lots) {
        lot.globalStatus = 'RECALLED';
        await em.save(lot);
        const rl = em.create(RecallLot, {
          recallId: String(recall.id),
          lotId: String(lot.id),
          blockedAt: new Date(),
        });
        await em.save(rl);
        // Reservations remain until released under the sale lock; blocked lots cannot finalize.
      }
      await this.audit.record(em,{actorId:user.id,branchId:user.branchId,action:'LOT_RECALLED',entityType:'recall',entityId:String(recall.id),reason});
      return recall;
    });
  }
}

function DecimalMin(a: ReturnType<typeof d>, b: ReturnType<typeof d>) {
  return a.lt(b) ? a : b;
}
