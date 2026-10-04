import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser } from './current-user.decorator';
import { IdentityService, AuthUser } from './identity.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  @IsString()
  loginIdentifier!: string;
  @IsString()
  password!: string;
  @IsString()
  branchId!: string;
}

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('sessions')
  login(@Body() body: LoginDto) {
    return this.identity.login(body.loginIdentifier, body.password, body.branchId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('pharmacist-shifts/start')
  start(@CurrentUser() user: AuthUser) {
    return this.identity.startShift(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('pharmacist-shifts/end')
  end(@CurrentUser() user: AuthUser) {
    return this.identity.endShift(user);
  }
}
