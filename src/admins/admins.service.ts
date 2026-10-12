import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './entities/admin.entity';

export type NewAdmin = Pick<Admin, 'email' | 'passwordHash' | 'firstName' | 'lastName' | 'role'>;

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminsRepository: Repository<Admin>,
  ) {}

  findByEmail(email: string): Promise<Admin | null> {
    return this.adminsRepository.findOne({ where: { email } });
  }

  findById(adminId: string): Promise<Admin | null> {
    return this.adminsRepository.findOne({ where: { adminId } });
  }

  async createAdmin(data: NewAdmin): Promise<Admin> {
    const admin = this.adminsRepository.create(data);
    const savedAdmin = await this.adminsRepository.save(admin);
    return this.adminsRepository.findOneByOrFail({ adminId: savedAdmin.adminId });
  }

  toPublicAdmin(admin: Admin) {
    const { passwordHash, ...safeAdmin } = admin;
    return safeAdmin;
  }
}
