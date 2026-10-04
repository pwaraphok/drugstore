import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrintJob, Sale, SaleItem } from '../database/entities';
import { AuthUser } from '../identity/identity.service';
import { OutboxService } from '../common/outbox.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PrintingService {
  constructor(
    @InjectRepository(PrintJob) private readonly jobs: Repository<PrintJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async enqueueLabel(user: AuthUser, saleId: string, reprintOf?: string) {
    const sale = await this.dataSource.manager.findOneByOrFail(Sale, { id: saleId as never, branchId:user.branchId, status:'COMPLETED' });
    const items = await this.dataSource.manager.find(SaleItem, { where: { saleId } });
    const escape=(s:unknown)=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]!));
    const html = items
      .map(
        (item) => `<div class="label" style="width:80mm;min-height:50mm;font-family:sans-serif;padding:4mm;border:1px solid #000">
      <div><strong>${escape((item.productSnapshot as { tradeName?: string }).tradeName)}</strong></div>
      <div>ผู้รับบริการ ${escape(sale.patientSnapshot?.name||"ไม่ระบุชื่อ")}</div>
      <div>จำนวน ${item.quantity} ${escape(item.productSnapshot.unitName)}</div>
      <div>ผู้จ่าย ${escape(sale.pharmacistSnapshot||"ดูเลขผู้ปฏิบัติการในบิล")}</div>
      <div>${escape(item.directionsSnapshot)}</div>
      <div>วันที่จ่าย ${new Date(sale.completedAt||sale.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</div>
      <div>บิล ${sale.invoiceNumber}</div>
    </div>`,
      )
      .join('\n');
    const job = this.jobs.create({
      branchId: user.branchId,
      documentType: 'DISPENSING_LABEL',
      documentId: saleId,
      templateVersion: '80x50-v1',
      state: 'QUEUED',
      duplicateOf: reprintOf ?? null,
      htmlSnapshot: html,
    });
    await this.jobs.save(job);
    await this.dataSource.transaction((em) =>
      this.outbox.enqueue(em, 'PRINT_JOB', { printJobId: String(job.id), reprint: Boolean(reprintOf) }, user.branchId),
    );
    return job;
  }

  list(branchId: string) {
    return this.jobs.find({ where: { branchId }, order: { id: 'DESC' }, take: 50 });
  }

  async mark(id: string, state: string, branchId:string) {
    if (!['SENT','CONFIRMED','FAILED','UNKNOWN'].includes(state)) throw new UnprocessableEntityException('สถานะพิมพ์ไม่ถูกต้อง');
    const job = await this.jobs.findOneByOrFail({ id: id as never, branchId });
    job.state = state;
    job.attemptCount += 1;
    return this.jobs.save(job);
  }
}
