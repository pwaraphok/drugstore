import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
export class PurchasingController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('receive')
  receive(@CurrentUser() user: AuthUser, @Headers('idempotency-key') key: string, @Body() body: Parameters<InventoryService['receiveGoods']>[1]) {
    return this.inventory.receiveGoods(user, body, key);
  }

  @Post('recalls')
  recall(@CurrentUser() user: AuthUser, @Body() body: { reason: string; lotIds: string[] }) {
    return this.inventory.createRecall(user, body.reason, body.lotIds);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryQueryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('availability')
  availability(
    @CurrentUser() user: AuthUser,
    @Query('productId') productId: string,
    @Query('quantityBase') quantityBase = '1',
  ) {
    return this.inventory.withTransaction((em) => this.inventory.fefoCandidates(em, productId, user.branchId, quantityBase));
  }
}
