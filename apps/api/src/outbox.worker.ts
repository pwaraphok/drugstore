import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales/sales.service';
import { OutboxEvent } from './database/entities';

@Injectable()
export class OutboxWorker {
  private readonly log = new Logger(OutboxWorker.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly sales: SalesService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async drain(): Promise<void> {
    await this.sales.expireReservations();
    await this.dataSource.transaction(async (em) => {
      const events = await em
        .createQueryBuilder(OutboxEvent, 'e')
        .setLock('pessimistic_write')
        .where("e.state = 'PENDING' AND e.nextAttemptAt <= :now", { now: new Date() })
        .orderBy('e.id', 'ASC')
        .take(20)
        .getMany();
      for (const event of events) {
        try {
          event.state = event.eventType === 'PRINT_JOB' ? 'WAITING_CLIENT' : 'ACKNOWLEDGED';
          event.attemptCount += 1;
          await em.save(event);
        } catch (err) {
          event.attemptCount += 1;
          event.nextAttemptAt = new Date(Date.now() + Math.min(300_000, 2 ** event.attemptCount * 1000));
          if (event.attemptCount >= 8) event.state = 'DEAD_LETTER';
          await em.save(event);
          this.log.warn(`Outbox ${event.eventId} failed`);
        }
      }
    });
  }
}
