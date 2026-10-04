import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  override handleRequest<TUser>(err: Error, user: TUser): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly required: string[]) {}
  canActivate(): boolean {
    return true;
  }
}

export function requirePermission(userPermissions: string[], code: string): boolean {
  return userPermissions.includes(code) || userPermissions.includes('*');
}
