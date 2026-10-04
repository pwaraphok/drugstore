import { MigrationInterface, QueryRunner } from 'typeorm';
export class SaleSnapshots1791010088000 implements MigrationInterface {
 async up(q:QueryRunner):Promise<void>{await q.query('ALTER TABLE sales ADD COLUMN patient_snapshot JSON NULL, ADD COLUMN pharmacist_snapshot VARCHAR(255) NULL, ADD COLUMN completed_at DATETIME NULL');}
 async down(q:QueryRunner):Promise<void>{throw new Error('Preserve historical snapshots; use a reviewed forward migration.');}
}
