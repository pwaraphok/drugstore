import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, ProductBarcode, ProductPackage, Unit } from '../database/entities';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductPackage, ProductBarcode, Unit])],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
