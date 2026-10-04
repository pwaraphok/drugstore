import { Body, Controller, Post, UseGuards, Headers } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ReturnsService } from './returns.service';

@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key:string,
    @Body()
    body: {
      originalSaleId: string;
      quarantineLocationId: string;
      items: { originalAllocationId: string; quantity: string }[];
    },
  ) {
    return this.returns.requestReturn(user, body.originalSaleId, body.items, body.quarantineLocationId,key);
  }

  @Post('assess')
  assess(
    @CurrentUser() user: AuthUser,
    @Body() body: { returnItemId: string; disposition: 'SUPPLIER' | 'DESTROY' | 'QUARANTINE' | 'SELLABLE' },
  ) {
    return this.returns.assess(user, body.returnItemId, body.disposition);
  }
}
