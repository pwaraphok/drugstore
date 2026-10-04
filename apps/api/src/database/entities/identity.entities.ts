import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/bigint.transformer';
import { PrimaryEntity } from '../base.entity';

@Entity('branches')
@Unique(['code'])
export class Branch extends PrimaryEntity {
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Bangkok' })
  timezone!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  licenseReference!: string | null;

  @Column({ default: true })
  active!: boolean;
}

@Entity('users')
@Unique(['loginIdentifier'])
export class User extends PrimaryEntity {
  @Column({ type: 'varchar', length: 128 })
  loginIdentifier!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'int', default: 0 })
  failedLoginCount!: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}

@Entity('roles')
@Unique(['code'])
export class Role extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;
}

@Entity('permissions')
@Unique(['code'])
export class Permission extends PrimaryEntity {
  @Column({ type: 'varchar', length: 128 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;
}

@Entity('user_roles')
@Unique(['userId', 'roleId', 'branchId'])
export class UserRole extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  userId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  roleId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;
}

@Entity('role_permissions')
@Unique(['roleId', 'permissionId'])
export class RolePermission extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  roleId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  permissionId!: string;
}

@Entity('pharmacists')
@Index(['userId'], { unique: true })
export class Pharmacist extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  licenseNumber!: string;

  @Column({ type: 'varchar', length: 32, default: 'VERIFIED' })
  verificationStatus!: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  verifiedAt!: Date | null;
}

@Entity('pharmacist_shifts')
export class PharmacistShift extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  pharmacistId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'datetime', precision: 6 })
  startedAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  verifiedBy!: string | null;
}

@Entity('patients')
@Unique(['branchId', 'patientNumber'])
export class Patient extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'varchar', length: 32 })
  patientNumber!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contact!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'NOT_ASKED' })
  allergyStatus!: string;

  @Column({ type: 'int', default: 1 })
  recordVersion!: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  allergyStatusConfirmedBy!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  allergyStatusConfirmedAt!: Date | null;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

@Entity('patient_contexts')
export class PatientContext extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'text' })
  contextText!: string;

  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ type: 'datetime', precision: 6 })
  recordedAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  reviewedAt!: Date | null;
}

@Entity('patient_allergies')
export class PatientAllergy extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'varchar', length: 32 })
  targetType!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ingredientId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  drugClassId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  productId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rawName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reaction!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  severity!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'UNVERIFIED' })
  verificationStatus!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reporter!: string | null;

  @Column({ type: 'date', nullable: true })
  onsetDate!: string | null;
}

@Entity('patient_medications')
export class PatientMedication extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  productId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ingredientId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rawName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  doseText!: string | null;

  @Column({ type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ default: true })
  activeStatus!: boolean;

  @Column({ type: 'varchar', length: 64, default: 'PATIENT_REPORTED' })
  source!: string;
}

@Entity('prescriptions')
export class Prescription extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  prescriberReference!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  issuedAt!: Date;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  attachmentId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'UNVERIFIED' })
  verificationStatus!: string;
}

@Entity('prescription_items')
export class PrescriptionItem extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  prescriptionId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  productId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ingredientId!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  unitId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dose!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  route!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  frequency!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  duration!: string | null;

  @Column({ type: 'text', nullable: true })
  instructions!: string | null;
}

@Entity('encounters')
export class Encounter extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  patientId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  pharmacistId!: string;

  @Column({ type: 'text', nullable: true })
  complaint!: string | null;

  @Column({ type: 'text', nullable: true })
  assessmentNote!: string | null;

  @Column({ type: 'text', nullable: true })
  counselingNote!: string | null;

  @Column({ type: 'text', nullable: true })
  referralNote!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  occurredAt!: Date;
}

@Entity('attachments')
export class Attachment extends PrimaryEntity {
  @Column({ type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ type: 'varchar', length: 128 })
  checksum!: string;

  @Column({ type: 'int' })
  size!: number;

  @Column({ type: 'varchar', length: 64 })
  documentType!: string;

  @Column({ type: 'varchar', length: 64 })
  accessScope!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  retentionPolicyId!: string | null;
}
