import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditEvent } from '../database/entities/system.entities';

@Injectable()
export class AuditService {
  async record(
    em: EntityManager,
    input: {
      actorId?: string | null;
      action: string;
      entityType: string;
      entityId?: string | null;
      branchId?: string | null;
      correlationId?: string | null;
      reason?: string | null;
      before?: unknown;
      after?: unknown;
    },
  ): Promise<void> {
    const row = em.create(AuditEvent, {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      branchId: input.branchId ?? null,
      correlationId: input.correlationId ?? null,
      reason: input.reason ?? null,
      redactedBefore: input.before ? JSON.stringify(input.before) : null,
      redactedAfter: input.after ? JSON.stringify(input.after) : null,
    });
    await em.save(row);
  }
}
