import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES), InventoryModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
