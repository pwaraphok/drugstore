import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('payment-attempts')
  create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string,
    @Body() body: { saleId: string; method: 'CASH' | 'PROMPTPAY' | 'CARD'; amount: string; receivedAmount?: string },
  ) {
    return this.payments.createAttempt(user, { ...body, idempotencyKey: key });
  }

  @Post('payment-webhooks/promptpay')
  webhook(@Headers('x-signature') signature: string, @Body() body: Parameters<PaymentsService['promptpayWebhook']>[1]) {
    return this.payments.promptpayWebhook(signature, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refunds')
  refund(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string,
    @Body() body: { originalPaymentId: string; amount: string; reason: string; returnId?: string },
  ) {
    return this.payments.refund(user, body.originalPaymentId, body.amount, body.reason, body.returnId, key);
  }
}
