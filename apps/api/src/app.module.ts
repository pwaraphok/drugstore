import { AccessGuard } from './identity/access.guard';
import { OperationsController } from './operations.controller';
import { StockControlController } from './stock-control.controller';
import { ManagementController } from './management.controller';
import { HealthController } from './health.controller';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ALL_ENTITIES } from './database/entities';
import { SnakeNamingStrategy } from './database/snake-naming.strategy';
import { CatalogModule } from './catalog/catalog.module';
import { ClinicalModule } from './clinical/clinical.module';
import { IdentityModule } from './identity/identity.module';
import { AuditController, BranchesController, PurchaseOrderActionsController, PurchaseOrderCrudController } from './identity/extra.controllers';
import { InventoryModule } from './inventory/inventory.module';
import { AuditEvent, Branch, PurchaseOrder, PurchaseOrderItem, Supplier } from './database/entities';
import { PrintingModule } from './printing/printing.module';
import { ReportingModule } from './reporting/reporting.module';
import { ReturnsModule } from './returns/returns.module';
import { PaymentsModule } from './payments/payments.module';
import { SalesModule } from './sales/sales.module';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mariadb',
        host: config.get('DB_HOST', '127.0.0.1'),
        port: Number(config.get('DB_PORT', 3307)),
        username: config.get('DB_USER', 'drugstore'),
        password: config.get('DB_PASSWORD', 'drugstore'),
        database: config.get('DB_NAME', 'drugstore'),
        entities: ALL_ENTITIES,
        synchronize: false,
        logging: false,
        namingStrategy: new SnakeNamingStrategy(),
        extra: { decimalNumbers: false, supportBigNumbers: true, bigNumberStrings: true },
        timezone: 'Z',
      }),
    }),
    TypeOrmModule.forFeature([Branch, PurchaseOrder, PurchaseOrderItem, Supplier, AuditEvent]),
    IdentityModule,
    CatalogModule,
    InventoryModule,
    ClinicalModule,
    SalesModule,
    PaymentsModule,
    ReturnsModule,
    ReportingModule,
    PrintingModule,
  ],
  controllers: [ManagementController, StockControlController, OperationsController, HealthController, BranchesController, PurchaseOrderCrudController, PurchaseOrderActionsController, AuditController],
  providers: [
    OutboxWorker,
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
