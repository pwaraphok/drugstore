import { Body, Controller, Get, Post, UseGuards, Param, ForbiddenException, UnprocessableEntityException, Headers } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency.service';
import { assertPositiveQuantity, d } from '../common/decimal';
import { ProductPackage, Product } from '../database/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent, Branch, PurchaseOrder, PurchaseOrderItem, Supplier } from '../database/entities';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';

@Controller('branches')
export class BranchesController {
  constructor(@InjectRepository(Branch) private readonly branches: Repository<Branch>) {}

  @Get()
  list() {
    return this.branches.find({ where: { active: true } });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrderCrudController {
  constructor(
    @InjectRepository(PurchaseOrder) private readonly pos: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem) private readonly items: Repository<PurchaseOrderItem>,
    @InjectRepository(Supplier) private readonly suppliers: Repository<Supplier>,
    private readonly idem:IdempotencyService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.pos.find({ where: { branchId: user.branchId }, order: { id: 'DESC' }, take: 100 });
  }

  @Get('suppliers')
  suppliersList(@CurrentUser() user: AuthUser) {
    return this.suppliers.find({ where: { branchId: user.branchId } });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key:string,
    @Body()
    body: {
      supplierId: string;
      items: { productId: string; packageId: string; orderedQuantity: string; expectedCost: string }[];
    },
  ) {
    return this.pos.manager.transaction(async em=>{
    await em.findOneOrFail(Supplier,{where:{id:body.supplierId,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
    const request=await this.idem.begin(em,`po:${user.branchId}`,key,body);if(request.replay)return request.replay;
    const po = await em.save(
      em.create(PurchaseOrder,{
        branchId: user.branchId,
        createdBy: user.id,
        supplierId: body.supplierId,
        status: 'DRAFT',
      }),
    );
    for (const item of body.items) {
      const pkg=await em.findOneOrFail(ProductPackage,{where:{id:item.packageId,productId:item.productId}});
      const product=await em.findOneOrFail(Product,{where:{id:item.productId}});
      assertPositiveQuantity(d(item.orderedQuantity).mul(pkg.baseQuantity).toString(),product.quantityStep);
      if(d(item.expectedCost).lt(0))throw new UnprocessableEntityException('ต้นทุนไม่ถูกต้อง');
      await em.save(
        em.create(PurchaseOrderItem,{
          purchaseOrderId: String(po.id),
          productId:item.productId,packageId:item.packageId,orderedQuantity:item.orderedQuantity,expectedCost:item.expectedCost,
          receivedQuantity: '0',
        }),
      );
    }
    await this.idem.complete(em,request.request!,String(po.id),po);return po;
    });
  }

  @Post(':id/approve')
  async approve(@CurrentUser() user: AuthUser, @Param('id') id:string) {
    if(!user.roles.includes('MANAGER'))throw new ForbiddenException('ต้องให้ผู้จัดการอนุมัติ');
    const po=await this.pos.findOneByOrFail({id,branchId:user.branchId});if(po.status!=='DRAFT')return po;po.status='APPROVED';po.approvedBy=user.id;return this.pos.save(po);
  }

  @Get(':id') async detail(@CurrentUser() user:AuthUser,@Param('id')id:string){const po=await this.pos.findOneByOrFail({id,branchId:user.branchId});return {po,items:await this.items.find({where:{purchaseOrderId:id}})};}
}

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders/actions')
export class PurchaseOrderActionsController {
  constructor(@InjectRepository(PurchaseOrder) private readonly pos: Repository<PurchaseOrder>) {}

  @Post('approve')
  async approve(@CurrentUser() user: AuthUser, @Body() body: { id: string }) {
    if(!user.roles.includes('MANAGER'))throw new ForbiddenException('ต้องให้ผู้จัดการอนุมัติ');
    const po = await this.pos.findOneByOrFail({ id: body.id as never, branchId: user.branchId as never });
    if (po.status !== 'DRAFT') return po;
    po.status = 'APPROVED';
    po.approvedBy = user.id;
    return this.pos.save(po);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('audit-events')
export class AuditController {
  constructor(@InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    if (!user.roles.includes('AUDITOR') && !user.roles.includes('MANAGER') && !user.roles.includes('SYSTEM_ADMIN')) {
      return [];
    }
    return this.audit.find({ where: { branchId: user.branchId }, order: { id: 'DESC' }, take: 200 });
  }
}
