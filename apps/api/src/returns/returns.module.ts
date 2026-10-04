import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [InventoryModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
