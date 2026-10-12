import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';

// Clients are created by the Spring Boot backend; this service only reads them for login.
@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
  ) {}

  findByEmail(email: string): Promise<Client | null> {
    return this.clientsRepository.findOne({ where: { email } });
  }

  toPublicClient(client: Client) {
    const { passwordHash, ssn, ...safeClient } = client;
    return safeClient;
  }
}
