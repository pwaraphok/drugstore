import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { PrintingService } from './printing.service';

@UseGuards(JwtAuthGuard)
@Controller('print-jobs')
export class PrintingController {
  constructor(private readonly printing: PrintingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.printing.list(user.branchId);
  }

  @Post('labels')
  labels(@CurrentUser() user: AuthUser, @Body() body: { saleId: string; reprintOf?: string }) {
    return this.printing.enqueueLabel(user, body.saleId, body.reprintOf);
  }

  @Post(':id/state')
  state(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { state: string }) {
    return this.printing.mark(id, body.state, user.branchId);
  }
}
