import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';

export type NewClient = Pick<
  Client,
  'email' | 'passwordHash' | 'firstName' | 'lastName' | 'ssn' | 'phoneNumber' | 'dateOfBirth'
>;

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
  ) {}

  findByEmail(email: string): Promise<Client | null> {
    return this.clientsRepository.findOne({ where: { email } });
  }

  findBySsn(ssn: string): Promise<Client | null> {
    return this.clientsRepository.findOne({ where: { ssn } });
  }

  async createClient(data: NewClient): Promise<Client> {
    const client = this.clientsRepository.create(data);
    const savedClient = await this.clientsRepository.save(client);
    return this.clientsRepository.findOneByOrFail({ clientId: savedClient.clientId });
  }

  toPublicClient(client: Client) {
    const { passwordHash, ssn, ...safeClient } = client;
    return safeClient;
  }
}