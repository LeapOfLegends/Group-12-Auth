import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AdminRole } from '../admins/admin-role.enum';
import { AdminsService } from '../admins/admins.service';

// Checks the JWT from POST /api/auth/login and lets only active super admins through.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly adminsService: AdminsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token required');
    }

    let payload: { sub: string; role?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Client tokens are signed with the same secret but carry no role, so they stop here.
    if (payload.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can register admins');
    }

    // Re-check the database so a deactivated or demoted super admin cannot keep using an old token.
    const admin = await this.adminsService.findById(payload.sub);
    if (!admin || !admin.active || admin.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can register admins');
    }

    return true;
  }
}
