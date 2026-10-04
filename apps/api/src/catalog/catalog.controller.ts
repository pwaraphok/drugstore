import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  search(@Query('q') q?: string) {
    return this.catalog.search(q);
  }

  @Get('products/:id')
  detail(@Param('id') id: string) {
    return this.catalog.productDetail(id);
  }

  @Get('barcodes/resolve')
  resolve(@Query('code') code: string) {
    return this.catalog.resolveBarcode(code);
  }
}
