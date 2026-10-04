import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/identity.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ClinicalService } from './clinical.service';

@UseGuards(JwtAuthGuard)
@Controller('patients')
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.clinical.list(user.branchId, q);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { patientNumber?: string; name: string; birthDate?: string; contact?: string; allergyStatus?: string },
  ) {
    return this.clinical.create(user, { ...body, patientNumber: body.patientNumber ?? '' });
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clinical.detail(id, user.branchId);
  }

  @Post(':id/allergies')
  allergy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { targetType: string; ingredientId?: string; rawName?: string; reaction?: string; severity?: string },
  ) {
    return this.clinical.addAllergy(user, id, body);
  }

  @Post(':id/encounters')
  encounter(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { complaint?: string; assessmentNote?: string; counselingNote?: string; referralNote?: string },
  ) {
    return this.clinical.addEncounter(user, { ...body, patientId: id });
  }
}
