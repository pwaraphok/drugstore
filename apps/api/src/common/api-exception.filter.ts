import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req as Request & { correlationId?: string }).correlationId ||
      crypto.randomUUID();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { code: 'HTTP_ERROR', message: body }
          : (body as Record<string, unknown>);
      res.status(status).json({
        code: payload.code ?? payload.error ?? 'HTTP_ERROR',
        message: payload.message ?? exception.message,
        fieldErrors: payload.fieldErrors ?? payload.errors ?? undefined,
        correlationId,
      });
      return;
    }

    if (exception instanceof EntityNotFoundError) { res.status(404).json({code:'NOT_FOUND',message:'ไม่พบข้อมูลในขอบเขตสิทธิ์',correlationId}); return; }
    const err = exception as { code?: string; message?: string };
    if (err.code === 'ER_DUP_ENTRY') { res.status(409).json({code:'DUPLICATE',message:'ข้อมูลหรือคำขอซ้ำ กรุณาตรวจรายการเดิม',correlationId}); return; }
    const business = [
      'QUANTITY_MUST_BE_POSITIVE',
      'QUANTITY_STEP_MISMATCH',
      'INSUFFICIENT_STOCK',
      'IDEMPOTENCY_CONFLICT',
      'VERSION_CONFLICT',
      'CLINICAL_CHECK_STALE',
      'LOT_NOT_SELLABLE',
      'RESERVATION_EXPIRED',
    ];
    if (err?.code && business.includes(err.code)) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        code: err.code,
        message: err.message,
        correlationId,
      });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Request could not be completed',
      correlationId,
    });
  }
}
