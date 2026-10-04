import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesModule } from '../sales/sales.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES), InventoryModule, SalesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
