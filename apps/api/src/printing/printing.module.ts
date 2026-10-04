import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module';
import { PrintJob } from '../database/entities';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrintJob]), InventoryModule],
  controllers: [PrintingController],
  providers: [PrintingService],
})
export class PrintingModule {}
