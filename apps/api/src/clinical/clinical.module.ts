import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Encounter,
  Patient,
  PatientAllergy,
  PatientMedication,
  Prescription,
  PrescriptionItem,
} from '../database/entities';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, PatientAllergy, PatientMedication, Prescription, PrescriptionItem, Encounter]),
  ],
  controllers: [ClinicalController],
  providers: [ClinicalService],
})
export class ClinicalModule {}
