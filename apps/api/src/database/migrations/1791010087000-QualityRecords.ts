import {MigrationInterface,QueryRunner} from 'typeorm';
export class QualityRecords1791010087000 implements MigrationInterface {
 async up(q:QueryRunner){await q.query(`CREATE TABLE quality_records (id BIGINT PRIMARY KEY AUTO_INCREMENT,branch_id BIGINT NOT NULL,category VARCHAR(32) NOT NULL,title VARCHAR(255) NOT NULL,details TEXT NOT NULL,status VARCHAR(16) NOT NULL,created_by BIGINT NOT NULL,recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),FOREIGN KEY (branch_id) REFERENCES branches(id),FOREIGN KEY (created_by) REFERENCES users(id)) ENGINE=InnoDB`);}
 async down(){throw new Error('Quality evidence requires a reviewed forward migration');}
}
