import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ReportingService } from './reporting.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('sales')
  sales(@CurrentUser() user: AuthUser, @Query('from') from: string, @Query('to') to: string) {
    return this.reporting.salesSummary(user.branchId, from, to);
  }

  @Get('stock')
  stock(@CurrentUser() user: AuthUser) {
    return this.reporting.stockOnHand(user.branchId);
  }

  @Get('expiry')
  expiry(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.reporting.expiry(user.branchId, Number(days ?? 90));
  }

  @Post('regulatory')
  regulatory(
    @CurrentUser() user: AuthUser,
    @Body() body: { reportType: string; from: string; to: string },
  ) {
    return this.reporting.exportRegulatory(user, body.reportType, body.from, body.to);
  }
}
