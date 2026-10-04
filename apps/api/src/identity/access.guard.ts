import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { validateRequest } from '../common/input-validation';

@Injectable()
export class AccessGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = req.path as string;
    validateRequest(req);
    if ((req.method === 'POST' && path === '/sessions') || (req.method === 'GET' && ['/health','/branches'].includes(path))) return true;
    await super.canActivate(context);
    const read = req.method === 'GET';
    const group = path.split('/')[1];
    const policies: Record<string,string[]> = {
      sessions:['CASHIER','PHARMACIST','INVENTORY','MANAGER','AUDITOR','SYSTEM_ADMIN'],
      products: read ? ['CASHIER','PHARMACIST','INVENTORY','MANAGER'] : ['MANAGER','INVENTORY'],
      barcodes:['CASHIER','PHARMACIST','INVENTORY','MANAGER'],
      patients:['PHARMACIST'], 'pharmacist-shifts':['PHARMACIST'],
      sales:['CASHIER','PHARMACIST','MANAGER'], 'payment-attempts':['CASHIER','PHARMACIST','MANAGER'],
      refunds:['MANAGER'], returns:['PHARMACIST','MANAGER'],
      inventory:['INVENTORY','PHARMACIST','MANAGER'], 'purchase-orders':['INVENTORY','MANAGER'],
      reports:['MANAGER','AUDITOR','PHARMACIST','INVENTORY'], 'print-jobs':['PHARMACIST','CASHIER'],
      'audit-events':['AUDITOR','MANAGER'], operations:path==='/operations/lookups'?['MANAGER','PHARMACIST','INVENTORY','CASHIER']:['MANAGER','PHARMACIST','INVENTORY'],
      management:['MANAGER','SYSTEM_ADMIN','PHARMACIST','INVENTORY'],
    };
    if (!(policies[group] || []).some(role => req.user.roles.includes(role))) throw new ForbiddenException('ไม่มีสิทธิ์ใช้งานส่วนนี้');
    return true;
  }
}
