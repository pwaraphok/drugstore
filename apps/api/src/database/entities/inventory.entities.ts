import { Check, Column, Entity, Index, Unique } from 'typeorm';
import { bigintTransformer } from '../../common/bigint.transformer';
import { BranchScopedEntity, PrimaryEntity } from '../base.entity';

@Entity('product_lots')
@Index(['productId', 'globalStatus', 'usableUntilExclusive', 'id'])
@Unique(['productId', 'manufacturerId', 'lotNumber', 'expiryRaw'])
export class ProductLot extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  manufacturerId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  lotNumber!: string;

  @Column({ type: 'varchar', length: 32 })
  expiryRaw!: string;

  @Column({ type: 'varchar', length: 16 })
  expiryPrecision!: string;

  @Column({ type: 'date' })
  usableUntilExclusive!: string;

  @Column({ type: 'date', nullable: true })
  manufactureDate!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'RELEASED' })
  globalStatus!: string;
}

@Entity('inventory_locations')
@Unique(['branchId', 'code'])
export class InventoryLocation extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 32 })
  locationType!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  storageProfileId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;
}

@Entity('stock_balances')
@Unique(['lotId', 'locationId', 'conditionStatus'])
@Index(['productId', 'locationId', 'conditionStatus'])
@Check('on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand')
export class StockBalance extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  locationId!: string;

  @Column({ type: 'varchar', length: 32, default: 'SELLABLE' })
  conditionStatus!: string;

  @Column({ name: 'on_hand', type: 'decimal', precision: 18, scale: 6, default: '0' })
  onHand!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: '0' })
  reserved!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;
}

@Entity('stock_movements')
@Index(['businessDocumentType', 'businessDocumentLineId', 'movementLeg'], { unique: true })
export class StockMovement extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantityDelta!: string;

  @Column({ type: 'varchar', length: 32 })
  movementType!: string;

  @Column({ type: 'varchar', length: 64 })
  businessDocumentType!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  businessDocumentId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  businessDocumentLineId!: string;

  @Column({ type: 'varchar', length: 32, default: 'POST' })
  movementLeg!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  reversalOf!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  costSnapshot!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  actorId!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  occurredAt!: Date;

  @Column({ type: 'datetime', precision: 6 })
  postedAt!: Date;
}

@Entity('cost_layers')
export class CostLayer extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  goodsReceiptItemId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  receivedQuantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  remainingQuantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  unitCost!: string;

  @Column({ type: 'datetime', precision: 6 })
  receivedAt!: Date;
}

@Entity('stock_reservations')
export class StockReservation extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'datetime', precision: 6 })
  expiresAt!: Date;
}

@Entity('purchase_orders')
export class PurchaseOrder extends BranchScopedEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  supplierId!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approvedBy!: string | null;
}

@Entity('purchase_order_items')
export class PurchaseOrderItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  purchaseOrderId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  packageId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  orderedQuantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: '0' })
  receivedQuantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  expectedCost!: string;
}

@Entity('goods_receipts')
export class GoodsReceipt extends BranchScopedEntity {
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  purchaseOrderId!: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  supplierId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  supplierDocument!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  receivedAt!: Date;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  inspectorId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'POSTED' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  reasonNoPo!: string | null;
}

@Entity('goods_receipt_items')
export class GoodsReceiptItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  goodsReceiptId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  purchaseOrderItemId!: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  locationId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  receivedQuantityBase!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  unitCost!: string;

  @Column({ type: 'varchar', length: 32, default: 'SELLABLE' })
  conditionStatus!: string;
}

@Entity('stock_adjustments')
export class StockAdjustment extends BranchScopedEntity {
  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approverId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'POSTED' })
  status!: string;
}

@Entity('stock_adjustment_items')
export class StockAdjustmentItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  adjustmentId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantityDelta!: string;
}

@Entity('inventory_transfers')
export class InventoryTransfer extends BranchScopedEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  sourceLocationId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  destinationLocationId!: string;

  @Column({ type: 'varchar', length: 32, default: 'DISPATCHED' })
  status!: string;
}

@Entity('inventory_transfer_items')
export class InventoryTransferItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  transferId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  dispatchedQuantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: '0' })
  receivedQuantity!: string;
}

@Entity('return_receipts')
export class ReturnReceipt extends BranchScopedEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  originalSaleId!: string;

  @Column({ type: 'varchar', length: 32, default: 'REQUESTED' })
  status!: string;
}

@Entity('return_receipt_items')
export class ReturnReceiptItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  returnReceiptId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  originalAllocationId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity!: string;

  @Column({ type: 'varchar', length: 32, default: 'RECEIVED_QUARANTINE' })
  inspectionStatus!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  quarantineLocationId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  disposition!: string | null;
}

@Entity('recalls')
export class Recall extends BranchScopedEntity {
  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 128 })
  source!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;
}

@Entity('recall_lots')
export class RecallLot extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  recallId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  blockedAt!: Date | null;
}

@Entity('disposal_records')
export class DisposalRecord extends BranchScopedEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity!: string;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approverId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  movementId!: string | null;
}

@Entity('stock_counts')
export class StockCount extends BranchScopedEntity {
  @Column({ type: 'datetime', precision: 6 })
  snapshotAt!: Date;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;
}

@Entity('stock_count_items')
export class StockCountItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  stockCountId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceId!: string;

  @Column({ type: 'int' })
  snapshotVersion!: number;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  snapshotOnHand!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  countedQuantity!: string | null;
}
