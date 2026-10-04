import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { ComplianceExport, RegulatoryRule, RegulatoryRuleProduct } from '../database/entities';
import { AuthUser } from '../identity/identity.service';

@Injectable()
export class ReportingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async salesSummary(branchId: string, from: string, to: string) {
    return this.dataSource.query(
      `SELECT DATE(CONVERT_TZ(created_at,'+00:00','+07:00')) biz_date,
              COUNT(*) bills, SUM(grand_total) sales
       FROM sales
       WHERE branch_id=? AND status='COMPLETED' AND created_at >= ? AND created_at < ?
       GROUP BY biz_date ORDER BY biz_date`,
      [branchId, from, to],
    );
  }

  async expiry(branchId: string, days = 90) {
    return this.dataSource.query(
      `SELECT p.sku, p.trade_name, l.lot_number, l.usable_until_exclusive, b.on_hand, b.condition_status, loc.code location
       FROM stock_balances b
       JOIN product_lots l ON l.id=b.lot_id
       JOIN products p ON p.id=b.product_id
       JOIN inventory_locations loc ON loc.id=b.location_id
       WHERE loc.branch_id=? AND b.on_hand>0
         AND l.usable_until_exclusive <= DATE_ADD(DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')), INTERVAL ? DAY)
       ORDER BY l.usable_until_exclusive`,
      [branchId, days],
    );
  }

  async stockOnHand(branchId: string) {
    return this.dataSource.query(
      `SELECT p.sku, p.trade_name, l.lot_number, loc.code location, b.condition_status, b.on_hand, b.reserved,
              (b.on_hand-b.reserved) available, l.usable_until_exclusive
       FROM stock_balances b
       JOIN product_lots l ON l.id=b.lot_id
       JOIN products p ON p.id=b.product_id
       JOIN inventory_locations loc ON loc.id=b.location_id
       WHERE loc.branch_id=? AND b.on_hand>0
       ORDER BY p.trade_name, l.usable_until_exclusive`,
      [branchId],
    );
  }

  async exportRegulatory(user: AuthUser, reportType: string, from: string, to: string) {
    throw new UnprocessableEntityException('รายงานทางการยังไม่เปิด ต้องพัฒนาและตรวจรับ mapping และแม่แบบก่อน');
  }
}
