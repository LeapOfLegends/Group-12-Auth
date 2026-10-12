import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminsService } from '../admins/admins.service';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { LoginAdminDto } from './dto/login-admin.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterAdminDto) {
    const existingEmail = await this.adminsService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Admin with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const admin = await this.adminsService.createAdmin({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
    });

    return this.adminsService.toPublicAdmin(admin);
  }

  async login(dto: LoginAdminDto) {
    const admin = await this.adminsService.findByEmail(dto.email);

    if (!admin || !admin.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, admin.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Spring Boot reads "role" from this token to decide which data the admin may access.
    const payload = { sub: admin.adminId, email: admin.email, role: admin.role };
    const expiresIn = this.configService.get<string>('JWT_EXPIRATION') || '3600s';

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        algorithm: 'HS256',
        expiresIn,
      }),
      admin: this.adminsService.toPublicAdmin(admin),
    };
  }
}
