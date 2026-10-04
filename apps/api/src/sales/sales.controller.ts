import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { SalesService } from './sales.service';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.sales.list(user); }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser,@Param('id') id:string) { return this.sales.cancel(user,id); }

  @Post(':id/items/:itemId/remove')
  remove(@CurrentUser() user: AuthUser,@Param('id') id:string,@Param('itemId') itemId:string) {return this.sales.removeItem(user,id,itemId);}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: { patientId?: string }) {
    return this.sales.createDraft(user, body.patientId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.loadSale(id, user.branchId);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { productId: string; packageId: string; quantity: string; directions?: string },
  ) {
    return this.sales.addItem(user, id, body);
  }

  @Post(':id/reservations')
  reserve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.reserve(user, id);
  }

  @Post(':id/clinical-checks')
  check(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.clinicalCheck(user, id);
  }

  @Post(':id/clinical-decisions')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { checkId: string; alertId: string; action: string; reason: string },
  ) {
    return this.sales.loadSale(id,user.branchId).then(() => this.sales.decideAlert(user, body.checkId, body.alertId, body.action, body.reason));
  }

  @Post(':id/finalize')
  finalize(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: { cartVersion: number },
  ) {
    return this.sales.finalize(user, id, key, body.cartVersion);
  }

  @Post('cash-shifts/open')
  openShift(@CurrentUser() user: AuthUser, @Body() body: { openingFloat: string }) {
    return this.sales.openCashShift(user, body.openingFloat);
  }

  @Post('cash-shifts/close')
  closeShift(@CurrentUser() user: AuthUser, @Body() body: { countedCash: string; reason?: string }) {
    return this.sales.closeCashShift(user, body.countedCash, body.reason);
  }
}
