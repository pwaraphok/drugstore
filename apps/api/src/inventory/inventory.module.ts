import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from '../common/audit.service';
import { IdempotencyService } from '../common/idempotency.service';
import { OutboxService } from '../common/outbox.service';
import { ALL_ENTITIES } from '../database/entities';
import { InventoryService } from './inventory.service';
import { PurchasingController, InventoryQueryController } from './inventory.controller';

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES)],
  controllers: [PurchasingController, InventoryQueryController],
  providers: [InventoryService, AuditService, IdempotencyService, OutboxService],
  exports: [InventoryService, AuditService, IdempotencyService, OutboxService],
})
export class InventoryModule {}
