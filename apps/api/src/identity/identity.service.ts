import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository, IsNull } from 'typeorm';
import { Permission, Pharmacist, PharmacistShift, Role, RolePermission, User, UserRole } from '../database/entities';

export type AuthUser = {
  id: string;
  loginIdentifier: string;
  displayName: string;
  branchId: string;
  roles: string[];
  permissions: string[];
  pharmacistId?: string;
  activeShiftId?: string;
};

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission) private readonly rolePerms: Repository<RolePermission>,
    @InjectRepository(Permission) private readonly perms: Repository<Permission>,
    @InjectRepository(Pharmacist) private readonly pharmacists: Repository<Pharmacist>,
    @InjectRepository(PharmacistShift) private readonly shifts: Repository<PharmacistShift>,
    private readonly jwt: JwtService,
  ) {}

  async login(loginIdentifier: string, password: string, branchId: string) {
    const user = await this.users.findOne({ where: { loginIdentifier } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({ code: 'LOCKED', message: 'Account locked' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      user.failedLoginCount += 1;
      if (user.failedLoginCount >= 8) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.users.save(user);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.users.save(user);

    const payload = await this.buildAuthUser(String(user.id), branchId);
    const token = await this.jwt.signAsync({
      sub: payload.id,
      branchId: payload.branchId,
      roles: payload.roles,
    });
    return { token, user: payload };
  }

  async buildAuthUser(userId: string, branchId: string): Promise<AuthUser> {
    const user = await this.users.findOneByOrFail({ id: userId as never });
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('บัญชีถูกระงับ');
    const assignments = await this.userRoles.find({ where: { userId, branchId } });
    if (!assignments.length) throw new UnauthorizedException('ไม่มีสิทธิ์เข้าสาขานี้');
    const roleIds = assignments.map((a) => a.roleId);
    const roleRows = roleIds.length ? await this.roles.findBy(roleIds.map((id) => ({ id: id as never }))) : [];
    const rp = roleIds.length ? await this.rolePerms.find({ where: roleIds.map((roleId) => ({ roleId })) }) : [];
    const permIds = [...new Set(rp.map((x) => x.permissionId))];
    const permRows = permIds.length ? await this.perms.findBy(permIds.map((id) => ({ id: id as never }))) : [];
    const pharmacist = await this.pharmacists.findOne({ where: { userId } });
    const activeShift = pharmacist
      ? await this.shifts.findOne({
          where: { pharmacistId: String(pharmacist.id), branchId, endedAt: IsNull() },
        })
      : null;
    return {
      id: String(user.id),
      loginIdentifier: user.loginIdentifier,
      displayName: user.displayName,
      branchId,
      roles: roleRows.map((r) => r.code),
      permissions: permRows.map((p) => p.code),
      pharmacistId: pharmacist?.verificationStatus === 'VERIFIED' ? String(pharmacist.id) : undefined,
      activeShiftId: activeShift ? String(activeShift.id) : undefined,
    };
  }

  async startShift(user: AuthUser, verifiedBy?: string) {
    if (!user.pharmacistId) {
      throw new UnauthorizedException({ code: 'NOT_PHARMACIST', message: 'Not a pharmacist' });
    }
    return this.shifts.manager.transaction(async em=>{
      await em.findOneOrFail(Pharmacist,{where:{id:user.pharmacistId!},lock:{mode:'pessimistic_write'}});
      const existing=await em.findOne(PharmacistShift,{where:{pharmacistId:user.pharmacistId,branchId:user.branchId,endedAt:IsNull()}});
      if(existing)return existing;
      return em.save(em.create(PharmacistShift,{pharmacistId:user.pharmacistId,branchId:user.branchId,startedAt:new Date(),verifiedBy:verifiedBy??user.id}));
    });
  }

  async endShift(user:AuthUser){
    if(!user.pharmacistId)return null;
    return this.shifts.manager.transaction(async em=>{
      await em.findOneOrFail(Pharmacist,{where:{id:user.pharmacistId!},lock:{mode:'pessimistic_write'}});
      const existing=await em.findOne(PharmacistShift,{where:{pharmacistId:user.pharmacistId,branchId:user.branchId,endedAt:IsNull()},lock:{mode:'pessimistic_write'}});
      if(!existing)return null;existing.endedAt=new Date();return em.save(existing);
    });
  }
}
