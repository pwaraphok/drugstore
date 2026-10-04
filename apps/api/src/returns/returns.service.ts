import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { d, qty, assertPositiveQuantity } from '../common/decimal';
import { IdempotencyService } from '../common/idempotency.service';
import { Sale, SaleItem, Product } from '../database/entities';
import {
  AllocationCost,
  InventoryLocation,
  ReturnReceipt,
  ReturnReceiptItem,
  SaleItemAllocation,
  StockBalance,
} from '../database/entities';
import { AuthUser } from '../identity/identity.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventory: InventoryService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async requestReturn(
    user: AuthUser,
    originalSaleId: string,
    items: { originalAllocationId: string; quantity: string }[],
    quarantineLocationId: string,
    key?:string,
  ) {
    return this.dataSource.transaction(async (em) => {
      await em.findOneOrFail(Sale,{where:{id:originalSaleId,branchId:user.branchId,status:'COMPLETED'},lock:{mode:'pessimistic_write'}});
      const started=await this.idempotency.begin(em,`return:${user.branchId}:${originalSaleId}`,key,{items,quarantineLocationId});
      if(started.replay)return started.replay;
      if(!Array.isArray(items)||!items.length)throw new UnprocessableEntityException('ระบุรายการคืน');
      await em.findOneOrFail(InventoryLocation,{where:{id:quarantineLocationId,branchId:user.branchId,locationType:'QUARANTINE'}});
      const receipt = em.create(ReturnReceipt, {
        branchId: user.branchId,
        createdBy: user.id,
        originalSaleId,
        status: 'RECEIVED_QUARANTINE',
      });
      await em.save(receipt);
      for (const item of items) {
        assertPositiveQuantity(item.quantity,'0.000001');
        const alloc = await em.findOneOrFail(SaleItemAllocation, {
          where: { id: item.originalAllocationId as never },
          lock: { mode: 'pessimistic_write' },
        });
        const product=await em.findOneOrFail(Product,{where:{id:alloc.productId}});assertPositiveQuantity(item.quantity,product.quantityStep);
        await this.inventory.lockLotsThenBalances(em,[alloc.lotId],[]);
        const prior = await em.find(ReturnReceiptItem, { where: { originalAllocationId: item.originalAllocationId } });
        await em.findOneOrFail(SaleItem,{where:{id:alloc.saleItemId,saleId:originalSaleId}});
        const already = prior.reduce((acc, p) => acc.plus(d(p.quantity)), d(0));
        if (already.plus(d(item.quantity)).gt(d(alloc.quantityBase))) {
          throw new UnprocessableEntityException({
            code: 'RETURN_EXCEEDS_ALLOCATION',
            message: 'Return quantity exceeds original allocation remainder',
          });
        }
        const line = em.create(ReturnReceiptItem, {
          returnReceiptId: String(receipt.id),
          originalAllocationId: item.originalAllocationId,
          quantity: qty(item.quantity),
          inspectionStatus: 'RECEIVED_QUARANTINE',
          quarantineLocationId,
        });
        await em.save(line);
        let qBal = await em.findOne(StockBalance, {
          where: {
            lotId: alloc.lotId,
            locationId: quarantineLocationId,
            conditionStatus: 'QUARANTINED',
          },
        });
        if (!qBal) {
          qBal = em.create(StockBalance, {
            productId: alloc.productId,
            lotId: alloc.lotId,
            locationId: quarantineLocationId,
            conditionStatus: 'QUARANTINED',
            onHand: '0',
            reserved: '0',
            version: 1,
          });
          await em.save(qBal);
        }
        const { balances } = await this.inventory.lockLotsThenBalances(em, [alloc.lotId], [String(qBal.id)]);
        await this.inventory.applyMovement(em, {
          branchId: user.branchId,
          balance: balances[0],
          quantityDelta: qty(item.quantity),
          movementType: 'RETURN_QUARANTINE',
          documentType: 'RETURN_RECEIPT_ITEM',
          documentId: String(receipt.id),
          documentLineId: String(line.id),
          actorId: user.id,
        });
        const costs = await em.find(AllocationCost, { where: { allocationId: String(alloc.id) } });
        let skip=already,remaining=d(item.quantity);
        const restore:{costLayerId:string;quantity:string}[]=[];
        for(const c of costs.sort((a,b)=>Number(BigInt(a.id)-BigInt(b.id)))) {
          const skipped=skip.lt(c.quantity)?skip:d(c.quantity);skip=skip.minus(skipped);
          const available=d(c.quantity).minus(skipped);const take=remaining.lt(available)?remaining:available;
          if(take.gt(0))restore.push({costLayerId:c.costLayerId,quantity:qty(take)});
          remaining=remaining.minus(take);
        }
        if(remaining.gt(0))throw new UnprocessableEntityException('ต้นทุนคืนไม่ครบ');
        await this.inventory.restoreCostFromAllocation(em, restore);
      }
      const loc = await em.findOne(InventoryLocation, { where: { id: quarantineLocationId as never } });
      void loc;
      await this.idempotency.complete(em,started.request!,String(receipt.id),receipt);
      return receipt;
    });
  }

  async assess(
    user: AuthUser,
    returnItemId: string,
    disposition: 'SUPPLIER' | 'DESTROY' | 'QUARANTINE' | 'SELLABLE',
  ) {
    return this.dataSource.transaction(async (em) => {
      const item = await em.findOneOrFail(ReturnReceiptItem, { where: { id: returnItemId as never },lock:{mode:'pessimistic_write'} });
      await em.findOneOrFail(ReturnReceipt,{where:{id:item.returnReceiptId,branchId:user.branchId}});
      if(disposition!=='QUARANTINE')throw new UnprocessableEntityException('การปล่อย/ทำลายสินค้าคืนยังไม่เปิด ให้เก็บกักกันและทำตาม SOP');
      item.disposition = disposition;
      item.inspectionStatus = 'ASSESSED';
      return em.save(item);
    });
  }
}
