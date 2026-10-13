import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminsService } from '../admins/admins.service';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Clients register here; admin accounts are created by the Spring Boot backend.
@Injectable()
export class AuthService {
  private readonly adminEmailDomains: string[];

  constructor(
    private readonly adminsService: AdminsService,
    private readonly clientsService: ClientsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.adminEmailDomains = (this.configService.get<string>('ADMIN_EMAIL_DOMAINS') || 'admin.com,fmr.com')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
  }

  async register(dto: RegisterDto) {
    // Login looks up admin-domain emails in the admins table, so a client could never sign in with one.
    const domain = this.emailDomain(dto.email);
    if (this.adminEmailDomains.includes(domain)) {
      throw new BadRequestException(
        `Client registration does not accept emails ending in @${domain}; this domain is reserved for admins.`,
      );
    }

    const existingEmail = await this.clientsService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Client with this email already exists');
    }

    const existingSsn = await this.clientsService.findBySsn(dto.ssn);
    if (existingSsn) {
      throw new ConflictException('Client with this SSN already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const client = await this.clientsService.createClient({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      ssn: dto.ssn,
      phoneNumber: dto.phoneNumber,
      dateOfBirth: dto.dateOfBirth,
    });

    return this.clientsService.toPublicClient(client);
  }

  // One endpoint for everyone: the email domain decides which table is checked, with no fall-through.
  async login(dto: LoginDto) {
    return this.isAdminEmail(dto.email) ? this.loginAdmin(dto) : this.loginClient(dto);
  }

  private async loginAdmin({ email, password }: LoginDto) {
    // Spring Boot stores admin emails lowercase.
    const admin = await this.adminsService.findByEmail(email.toLowerCase());

    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Spring Boot reads "role" from this token to decide what the admin may do.
    return {
      accessToken: await this.sign({ sub: admin.adminId, email: admin.email, role: admin.role }),
      admin: this.adminsService.toPublicAdmin(admin),
    };
  }

  private async loginClient({ email, password }: LoginDto) {
    const client = await this.clientsService.findByEmail(email);

    if (!client || !(await bcrypt.compare(password, client.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: await this.sign({ sub: client.clientId, email: client.email, roles: ['CLIENT'] }),
      client: this.clientsService.toPublicClient(client),
    };
  }

  private isAdminEmail(email: string) {
    return this.adminEmailDomains.includes(this.emailDomain(email));
  }

  // The domain follows the last "@"; a quoted local part such as "a@b"@example.com can contain another.
  private emailDomain(email: string) {
    return email.toLowerCase().split('@').pop() ?? '';
  }

  private sign(payload: Record<string, unknown>) {
    const expiresIn = this.configService.get<string>('JWT_EXPIRATION') || '3600s';
    return this.jwtService.signAsync(payload, { algorithm: 'HS256', expiresIn });
  }
}
