import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  Encounter,
  Patient,
  PatientAllergy,
  PatientMedication,
  Prescription,
  PrescriptionItem,
} from '../database/entities';
import { AuthUser } from '../identity/identity.service';

@Injectable()
export class ClinicalService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientAllergy) private readonly allergies: Repository<PatientAllergy>,
    @InjectRepository(PatientMedication) private readonly meds: Repository<PatientMedication>,
    @InjectRepository(Prescription) private readonly rx: Repository<Prescription>,
    @InjectRepository(PrescriptionItem) private readonly rxItems: Repository<PrescriptionItem>,
    @InjectRepository(Encounter) private readonly encounters: Repository<Encounter>,
  ) {}

  list(branchId: string, q?: string) {
    const qb = this.patients.createQueryBuilder('p').where('p.branchId = :branchId', { branchId });
    if (q) qb.andWhere('(p.name LIKE :q OR p.patientNumber LIKE :q)', { q: `%${q}%` });
    return qb.orderBy('p.name', 'ASC').take(50).getMany();
  }

  async create(user: AuthUser, input: { patientNumber: string; name: string; birthDate?: string; contact?: string; allergyStatus?: string }) {
    if (!input.name?.trim()) throw new UnprocessableEntityException('ระบุชื่อผู้รับบริการ');
    const patient = this.patients.create({
      branchId: user.branchId,
      patientNumber: input.patientNumber || `HN${randomUUID().slice(0,12)}`,
      name: input.name,
      birthDate: input.birthDate ?? null,
      contact: input.contact ?? null,
      allergyStatus: input.allergyStatus ?? 'NOT_ASKED',
      recordVersion: 1,
    });
    return this.patients.save(patient);
  }

  async detail(id: string, branchId: string) {
    const patient = await this.patients.findOneByOrFail({ id: id as never, branchId: branchId as never });
    const [allergies, medications, prescriptions, encounters] = await Promise.all([
      this.allergies.find({ where: { patientId: id } }),
      this.meds.find({ where: { patientId: id } }),
      this.rx.find({ where: { patientId: id } }),
      this.encounters.find({ where: { patientId: id } }),
    ]);
    return { patient, allergies, medications, prescriptions, encounters };
  }

  async addAllergy(
    user: AuthUser,
    patientId: string,
    input: { targetType: string; ingredientId?: string; rawName?: string; reaction?: string; severity?: string },
  ) {
    if(!input.rawName?.trim() && !input.ingredientId) throw new UnprocessableEntityException('ระบุประวัติแพ้ยา');
    return this.patients.manager.transaction(async em=>{
      const patient=await em.findOneOrFail(Patient,{where:{id:patientId,branchId:user.branchId},lock:{mode:'pessimistic_write'}});
      const row=await em.save(em.create(PatientAllergy,{patientId,targetType:input.ingredientId?'INGREDIENT':'RAW',ingredientId:input.ingredientId||null,rawName:input.rawName||null,reaction:input.reaction||null,severity:input.severity||null,verificationStatus:input.ingredientId?'VERIFIED':'UNMATCHED',reporter:user.displayName}));
      patient.allergyStatus='KNOWN_ALLERGIES';patient.recordVersion++;patient.allergyStatusConfirmedBy=user.id;patient.allergyStatusConfirmedAt=new Date();await em.save(patient);return row;
    });
  }

  async addEncounter(
    user: AuthUser,
    input: { patientId: string; complaint?: string; assessmentNote?: string; counselingNote?: string; referralNote?: string },
  ) {
    if (!user.pharmacistId) {
      throw Object.assign(new Error('PHARMACIST_REQUIRED'), { code: 'PHARMACIST_REQUIRED' });
    }
    await this.patients.findOneByOrFail({id:input.patientId,branchId:user.branchId});
    const row = this.encounters.create({
      branchId: user.branchId,
      patientId: input.patientId,
      pharmacistId: user.pharmacistId,
      complaint: input.complaint ?? null,
      assessmentNote: input.assessmentNote ?? null,
      counselingNote: input.counselingNote ?? null,
      referralNote: input.referralNote ?? null,
      occurredAt: new Date(),
    });
    return this.encounters.save(row);
  }
}
