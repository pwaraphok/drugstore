import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { OutboxEvent } from '../database/entities/system.entities';

@Injectable()
export class OutboxService {
  async enqueue(
    em: EntityManager,
    eventType: string,
    payload: unknown,
    branchId: string,
  ): Promise<OutboxEvent> {
    const event = em.create(OutboxEvent, {
      eventId: randomUUID(),
      eventType,
      branchId,
      state: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(),
      payloadJson: JSON.stringify(payload),
    });
    return em.save(event);
  }
}
