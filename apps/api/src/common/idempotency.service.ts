import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { IdempotencyRequest } from '../database/entities/system.entities';

@Injectable()
export class IdempotencyService {
  hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
  }

  async begin(
    em: EntityManager,
    scope: string,
    key: string | undefined,
    payload: unknown,
  ): Promise<{ replay?: unknown; request?: IdempotencyRequest }> {
    if (!key) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required for this mutation',
      });
    }
    const requestHash = this.hashPayload(payload);
    const existing = await em.findOne(IdempotencyRequest, {
      where: { scope, key },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency key reused with a different payload',
        });
      }
      if (existing.status === 'COMPLETED' && existing.safeResponse) {
        return { replay: JSON.parse(existing.safeResponse) };
      }
      return { request: existing };
    }
    const row = em.create(IdempotencyRequest, {
      scope,
      key,
      requestHash,
      status: 'STARTED',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    await em.save(row);
    return { request: row };
  }

  async complete(
    em: EntityManager,
    request: IdempotencyRequest,
    resourceId: string,
    safeResponse: unknown,
  ): Promise<void> {
    request.status = 'COMPLETED';
    request.resourceId = resourceId;
    request.safeResponse = JSON.stringify(safeResponse);
    await em.save(request);
  }
}
