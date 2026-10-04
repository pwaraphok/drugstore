import {Body,Controller,Get,Post,ForbiddenException,UnprocessableEntityException,Param} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {hash} from 'bcrypt';
import {CurrentUser} from './identity/current-user.decorator';
import {AuthUser} from './identity/identity.service';
import * as E from './database/entities';
import {AuditService} from './common/audit.service';
@Controller('management')
export class ManagementController {
 constructor(private readonly db:DataSource,private readonly audit:AuditService){}
 private require(u:AuthUser,roles=['MANAGER','SYSTEM_ADMIN']){if(!roles.some(r=>u.roles.includes(r)))throw new ForbiddenException('ไม่มีสิทธิ์จัดการข้อมูลนี้');}
 @Get('users') async users(@CurrentUser()u:AuthUser){this.require(u);return this.db.query(`SELECT u.id,u.login_identifier,u.display_name,u.status,GROUP_CONCAT(r.code ORDER BY r.code) roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE ur.branch_id=? GROUP BY u.id,u.login_identifier,u.display_name,u.status ORDER BY u.id`,[u.branchId]);}
 @Post('users') async create(@CurrentUser()u:AuthUser,@Body()b:{loginIdentifier:string;displayName:string;password:string;role:string}){
  this.require(u);if(!b.loginIdentifier?.trim()||!b.displayName?.trim()||!b.password||b.password.length<12||!['CASHIER','INVENTORY','AUDITOR','PHARMACIST'].includes(b.role))throw new UnprocessableEntityException('ข้อมูลไม่ครบ หรือรหัสผ่านสั้นกว่า 12 ตัว');
  return this.db.transaction(async em=>{const role=await em.findOneOrFail(E.Role,{where:{code:b.role}});const user=await em.save(em.create(E.User,{loginIdentifier:b.loginIdentifier,displayName:b.displayName,passwordHash:await hash(b.password,12),status:'ACTIVE'}));await em.save(em.create(E.UserRole,{userId:String(user.id),roleId:String(role.id),branchId:u.branchId}));await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'USER_CREATED',entityType:'user',entityId:String(user.id)});return {id:String(user.id),loginIdentifier:user.loginIdentifier,displayName:user.displayName};});
 }
 @Post('users/:id/status') async status(@CurrentUser()u:AuthUser,@Param('id')id:string,@Body()b:{status:string;reason:string}){
  this.require(u);if(id===u.id||!['ACTIVE','DISABLED'].includes(b.status)||!b.reason?.trim())throw new UnprocessableEntityException('สถานะไม่ถูกต้องหรือเป็นบัญชีตนเอง');
  return this.db.transaction(async em=>{await em.findOneOrFail(E.UserRole,{where:{userId:id,branchId:u.branchId}});await em.update(E.User,{id},{status:b.status});await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'USER_STATUS_CHANGED',entityType:'user',entityId:id,reason:b.reason});return {id,status:b.status};});
 }
 @Post('pharmacists') async pharmacist(@CurrentUser()u:AuthUser,@Body()b:{userId:string;name:string;licenseNumber:string;reviewNote:string}){
  this.require(u,['MANAGER']);if(!b.userId||!b.name?.trim()||!b.licenseNumber?.trim()||!b.reviewNote?.trim())throw new UnprocessableEntityException('ระบุข้อมูลใบอนุญาตและหลักฐานทบทวน');
  return this.db.transaction(async em=>{await em.findOneOrFail(E.UserRole,{where:{userId:b.userId,branchId:u.branchId}});const p=await em.save(em.create(E.Pharmacist,{userId:b.userId,name:b.name,licenseNumber:b.licenseNumber,verificationStatus:'VERIFIED',verifiedAt:new Date()}));await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'PHARMACIST_MANUALLY_VERIFIED',entityType:'pharmacist',entityId:String(p.id),reason:b.reviewNote});return p;});
 }
 @Get('quality') async quality(@CurrentUser()u:AuthUser){this.require(u,['MANAGER','PHARMACIST','INVENTORY']);return this.db.query('SELECT id,category,title,details,status,recorded_at,created_by FROM quality_records WHERE branch_id=? ORDER BY id DESC LIMIT 100',[u.branchId]);}
 @Post('quality') async record(@CurrentUser()u:AuthUser,@Body()b:{category:string;title:string;details:string;status:string}){
  this.require(u,['MANAGER','PHARMACIST','INVENTORY']);if(!['TEMPERATURE','SOP','TRAINING','COMPLAINT','CORRECTIVE_ACTION','PRIVACY_REQUEST'].includes(b.category)||!b.title?.trim()||!b.details?.trim()||!['OPEN','CLOSED'].includes(b.status))throw new UnprocessableEntityException('ข้อมูลหลักฐานไม่ครบ');
  return this.db.transaction(async em=>{const row=await em.query('INSERT INTO quality_records(branch_id,category,title,details,status,created_by) VALUES (?,?,?,?,?,?)',[u.branchId,b.category,b.title,b.details,b.status,u.id]);await this.audit.record(em,{actorId:u.id,branchId:u.branchId,action:'QUALITY_RECORDED',entityType:'quality_record',entityId:String(row.insertId)});return {id:String(row.insertId)};});
 }
 @Post('locations') async location(@CurrentUser()u:AuthUser,@Body()b:{code:string;locationType:string}){this.require(u,['MANAGER','INVENTORY']);if(!b.code?.trim()||!['SHELF','FRIDGE','QUARANTINE'].includes(b.locationType))throw new UnprocessableEntityException('ข้อมูลตำแหน่งไม่ครบ');return this.db.manager.save(this.db.manager.create(E.InventoryLocation,{branchId:u.branchId,code:b.code,locationType:b.locationType,status:'OPEN'}));}
}
