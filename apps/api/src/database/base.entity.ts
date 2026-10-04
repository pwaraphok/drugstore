import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../common/bigint.transformer';

export abstract class PrimaryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  toJSON(): this {
    return { ...this, id: String(this.id) };
  }
}

export abstract class BranchScopedEntity extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  createdBy!: string | null;
}

export abstract class VersionedEntity extends BranchScopedEntity {
  @Column({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
