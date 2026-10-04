import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Permission, Pharmacist, PharmacistShift, Role, RolePermission, User, UserRole } from '../database/entities';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRole, Role, RolePermission, Permission, Pharmacist, PharmacistShift]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'change-me-in-production'),
        signOptions: { expiresIn: Number(config.get('JWT_EXPIRES_IN_SECONDS', 28800)) },
      }),
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtStrategy],
  exports: [IdentityService, JwtModule],
})
export class IdentityModule {}
