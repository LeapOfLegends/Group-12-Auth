import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
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

  async login(dto: LoginDto) {
    const client = await this.clientsService.findByEmail(dto.email);

    if (!client) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, client.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: client.clientId, email: client.email };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
