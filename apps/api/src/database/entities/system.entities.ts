import { Column, CreateDateColumn, Entity, Index, Unique } from 'typeorm';
import { bigintTransformer } from '../../common/bigint.transformer';
import { PrimaryEntity } from '../base.entity';

@Entity('idempotency_requests')
@Unique(['scope', 'key'])
export class IdempotencyRequest extends PrimaryEntity {
  @Column({ type: 'varchar', length: 128 })
  scope!: string;

  @Column({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  resourceId!: string | null;

  @Column({ type: 'longtext', nullable: true })
  safeResponse!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @Column({ type: 'datetime', precision: 6 })
  expiresAt!: Date;
}

@Entity('outbox_events')
@Unique(['eventId'])
@Index(['state', 'nextAttemptAt'])
export class OutboxEvent extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  eventId!: string;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  state!: string;

  @Column({ type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ type: 'datetime', precision: 6 })
  nextAttemptAt!: Date;

  @Column({ type: 'longtext' })
  payloadJson!: string;
}

@Entity('inbox_events')
@Unique(['provider', 'providerEventId'])
export class InboxEvent extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  providerEventId!: string;

  @Column({ type: 'varchar', length: 32, default: 'RECEIVED' })
  state!: string;

  @Column({ type: 'longtext', nullable: true })
  payloadJson!: string | null;
}

@Entity('print_jobs')
export class PrintJob extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'varchar', length: 64 })
  documentType!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  documentId!: string;

  @Column({ type: 'varchar', length: 32, default: 'v1' })
  templateVersion!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  printerId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'QUEUED' })
  state!: string;

  @Column({ type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  duplicateOf!: string | null;

  @Column({ type: 'longtext', nullable: true })
  htmlSnapshot!: string | null;
}

@Entity('audit_events')
@Index(['entityType', 'entityId', 'createdAt'])
export class AuditEvent extends PrimaryEntity {
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  entityId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  branchId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'longtext', nullable: true })
  redactedBefore!: string | null;

  @Column({ type: 'longtext', nullable: true })
  redactedAfter!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

@Entity('compliance_exports')
export class ComplianceExport extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'varchar', length: 32 })
  reportType!: string;

  @Column({ type: 'date' })
  periodFrom!: string;

  @Column({ type: 'date' })
  periodTo!: string;

  @Column({ type: 'varchar', length: 32 })
  rulesVersion!: string;

  @Column({ type: 'text', nullable: true })
  sourceDocumentIds!: string | null;

  @Column({ type: 'varchar', length: 128 })
  fileChecksum!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  generatedBy!: string;

  @Column({ type: 'int', default: 1 })
  revision!: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  supersedesId!: string | null;

  @Column({ type: 'longtext' })
  payloadJson!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

@Entity('sops')
export class Sop extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 32 })
  version!: string;

  @Column({ type: 'date' })
  effectiveFrom!: string;
}

@Entity('sop_acknowledgements')
export class SopAcknowledgement extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  sopId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  userId!: string;

  @Column({ type: 'datetime', precision: 6 })
  acknowledgedAt!: Date;
}

@Entity('privacy_policies')
export class PrivacyPolicy extends PrimaryEntity {
  @Column({ type: 'varchar', length: 32 })
  version!: string;

  @Column({ type: 'text' })
  noticeText!: string;

  @Column({ type: 'date' })
  effectiveFrom!: string;
}

@Entity('consent_records')
export class ConsentRecord extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  policyId!: string;

  @Column({ type: 'varchar', length: 64 })
  purpose!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'datetime', precision: 6 })
  recordedAt!: Date;
}

@Entity('retention_policies')
export class RetentionPolicy extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  documentType!: string;

  @Column({ type: 'int' })
  retainYears!: number;

  @Column({ default: false })
  legalHold!: boolean;
}

@Entity('data_subject_requests')
export class DataSubjectRequest extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'varchar', length: 32 })
  requestType!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  outcomeNote!: string | null;
}
