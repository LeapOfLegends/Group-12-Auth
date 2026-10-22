import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AdminsService } from '../admins/admins.service';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { resolveSrv } from 'dns/promises';

// Clients register here; admin accounts are created by the Spring Boot backend.
@Injectable()
export class AuthService {
  private readonly adminEmailDomains: string[];

  constructor(
    private readonly adminsService: AdminsService,
    private readonly clientsService: ClientsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {
    this.adminEmailDomains = (this.configService.get<string>('ADMIN_EMAIL_DOMAINS') || 'admin.com')
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
      accessToken: await this.sign({ sub: admin.adminId, email: admin.email, roles: admin.role.toUpperCase() }),
      refreshToken: await this.issueRefreshToken('admin', admin.adminId),
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
      refreshToken: await this.issueRefreshToken('client', client.clientId),
      client: this.clientsService.toPublicClient(client),
    };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; accountType: 'client' | 'admin' };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.sub || !['client', 'admin'].includes(payload.accountType)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (
      !stored ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.accountId !== payload.sub ||
      stored.accountType !== payload.accountType
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.accountType === 'admin') {
      const admin = await this.adminsService.findById(stored.accountId);
      if (!admin) throw new UnauthorizedException('Invalid or expired refresh token');
      const tokens = await this.rotateRefreshToken(stored);
      return {
        accessToken: await this.sign({ sub: admin.adminId, email: admin.email, role: admin.role }),
        refreshToken: tokens.token,
      };
    }

    const client = await this.clientsService.findById(stored.accountId);
    if (!client) throw new UnauthorizedException('Invalid or expired refresh token');
    const tokens = await this.rotateRefreshToken(stored);
    return {
      accessToken: await this.sign({ sub: client.clientId, email: client.email, roles: ['CLIENT'] }),
      refreshToken: tokens.token,
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.refreshTokens.delete({ tokenHash: this.hashRefreshToken(refreshToken) });
    }
  }

  private async issueRefreshToken(accountType: 'client' | 'admin', accountId: string) {
    const { token, expiresAt } = await this.createRefreshToken(accountType, accountId);
    const tokenHash = this.hashRefreshToken(token);

    await this.refreshTokens.delete({ accountType, accountId });
    await this.refreshTokens.save(this.refreshTokens.create({ tokenHash, accountType, accountId, expiresAt }));
    return token;
  }

  private async rotateRefreshToken(stored: RefreshToken) {
    const { token, expiresAt } = await this.createRefreshToken(stored.accountType, stored.accountId);
    const result = await this.refreshTokens.update(
      { tokenHash: stored.tokenHash, expiresAt: MoreThan(new Date()) },
      { tokenHash: this.hashRefreshToken(token), expiresAt },
    );

    if (result.affected !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return { token, expiresAt };
  }

  private async createRefreshToken(accountType: 'client' | 'admin', accountId: string) {
    const lifetimeSeconds = this.refreshTokenLifetimeSeconds();
    const token = await this.jwtService.signAsync(
      { sub: accountId, accountType, jti: randomUUID() },
      { algorithm: 'HS256', expiresIn: lifetimeSeconds },
    );
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);
    return { token, expiresAt };
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenLifetimeSeconds() {
    const configured = Number(this.configService.get<string>('REFRESH_TOKEN_EXPIRATION'));
    return Number.isSafeInteger(configured) && configured > 0 ? configured : 30 * 24 * 60 * 60;
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
