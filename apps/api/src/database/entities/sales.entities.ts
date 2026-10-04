import { Column, Entity, Index, Unique } from 'typeorm';
import { bigintTransformer } from '../../common/bigint.transformer';
import { BranchScopedEntity, PrimaryEntity } from '../base.entity';

@Entity('sales')
@Unique(['invoiceNumber'])
@Index(['branchId', 'status', 'createdAt'])
export class Sale extends BranchScopedEntity {
  @Column({ type: 'varchar', length: 32 })
  invoiceNumber!: string;

  @Column({type:'json',nullable:true}) patientSnapshot!: {name:string} | null;
  @Column({type:'varchar',length:255,nullable:true}) pharmacistSnapshot!: string | null;
  @Column({type:'datetime',nullable:true}) completedAt!: Date | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  patientId!: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  cashierId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  pharmacistId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  shiftId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: string;

  @Column({ type: 'int', default: 1 })
  cartVersion!: number;

  @Column({ type: 'varchar', length: 8, default: 'THB' })
  currency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  discountTotal!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  taxTotal!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  grandTotal!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;
}

@Entity('sale_items')
export class SaleItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  packageId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  conversionSnapshot!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantityBase!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  discountAmount!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  taxAmount!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  lineTotal!: string;

  @Column({ type: 'json' })
  productSnapshot!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  directionsSnapshot!: string | null;
}

@Entity('sale_item_allocations')
export class SaleItemAllocation extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleItemId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lotId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  balanceId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantityBase!: string;
}

@Entity('allocation_costs')
export class AllocationCost extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  allocationId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  costLayerId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  unitCostSnapshot!: string;
}

@Entity('dispensing_records')
export class DispensingRecord extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleItemId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  prescriptionItemId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  encounterId!: string | null;

  @Column({ type: 'text', nullable: true })
  directionsSnapshot!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  pharmacistId!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  releasedAt!: Date | null;
}

@Entity('clinical_checks')
export class ClinicalCheck extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleId!: string;

  @Column({ type: 'int' })
  cartVersion!: number;

  @Column({ type: 'int' })
  patientRecordVersion!: number;

  @Column({ type: 'varchar', length: 64 })
  inputHash!: string;

  @Column({ type: 'varchar', length: 32 })
  knowledgeVersion!: string;

  @Column({ type: 'varchar', length: 32 })
  executionStatus!: string;

  @Column({ type: 'varchar', length: 64 })
  coverageStatus!: string;

  @Column({ type: 'datetime', precision: 6 })
  assessedAt!: Date;

  @Column({ type: 'json', nullable: true })
  missingInputs!: string[] | null;
}

@Entity('clinical_alerts')
export class ClinicalAlert extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  checkId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ruleId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  severity!: string;

  @Column({ type: 'varchar', length: 32 })
  suggestedAction!: string;

  @Column({ type: 'text', nullable: true })
  evidenceReference!: string | null;

  @Column({ type: 'text' })
  message!: string;
}

@Entity('clinical_decisions')
export class ClinicalDecision extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  checkId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  alertId!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  actorId!: string;

  @Column({ type: 'datetime', precision: 6 })
  decidedAt!: Date;
}

@Entity('payment_attempts')
@Index(['idempotencyKey'], { unique: true })
export class PaymentAttempt extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleId!: string;

  @Column({ type: 'varchar', length: 32 })
  method!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  receivedAmount!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  changeAmount!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  appliedAmount!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'CREATED' })
  status!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerReference!: string | null;

  @Column({ type: 'varchar', length: 128 })
  idempotencyKey!: string;
}

@Entity('payment_events')
@Unique(['provider', 'providerEventId'])
export class PaymentEvent extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  providerEventId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  attemptId!: string;

  @Column({ type: 'datetime', precision: 6 })
  verifiedAt!: Date;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sanitizedPayloadReference!: string | null;
}

@Entity('refunds')
export class Refund extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  originalPaymentId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  returnId!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 32, default: 'REQUESTED' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerReference!: string | null;
}

@Entity('sale_reversals')
export class SaleReversal extends BranchScopedEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  originalSaleId!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approvedBy!: string | null;
}

@Entity('cash_shifts')
export class CashShift extends BranchScopedEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  cashierId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  openingFloat!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  expectedCash!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  countedCash!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  variance!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  closedAt!: Date | null;
}

@Entity('cash_movements')
export class CashMovement extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  cashShiftId!: string;

  @Column({ type: 'varchar', length: 32 })
  movementType!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;
}

@Entity('paid_unfulfilled')
export class PaidUnfulfilled extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  saleId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  paymentAttemptId!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
