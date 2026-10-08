import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminEntity } from './entities/admin.entity';
import { AdminRole } from './admin-role.enum';

export type NewAdmin = Pick<
  AdminEntity,
  'email' | 'passwordHash' | 'firstName' | 'lastName' | 'roles'
>;

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(AdminEntity)
    private readonly adminsRepository: Repository<AdminEntity>,
  ) {}

  findByEmail(email: string): Promise<AdminEntity | null> {
    return this.adminsRepository.findOne({ where: { email } });
  }

  findById(adminId: string): Promise<AdminEntity | null> {
    return this.adminsRepository.findOne({ where: { adminId: parseInt(adminId, 10) as any } });
  }

  async createAdmin(data: NewAdmin): Promise<AdminEntity> {
    const admin = this.adminsRepository.create(data);
    const savedAdmin = await this.adminsRepository.save(admin);
    return this.adminsRepository.findOneByOrFail({ adminId: savedAdmin.adminId });
  }

  async updateRole(adminId: string, role: AdminRole): Promise<AdminEntity> {
    const id = parseInt(adminId, 10);
    await this.adminsRepository.update({ adminId: id as any }, { roles: role });
    return this.adminsRepository.findOneByOrFail({ adminId: id as any });
  }

  async deleteAdmin(adminId: string): Promise<void> {
    await this.adminsRepository.delete({ adminId: parseInt(adminId, 10) as any });
  }

  async findAll(): Promise<AdminEntity[]> {
    return this.adminsRepository.find({ order: { createdAt: 'ASC' } });
  }

  toPublicAdmin(admin: AdminEntity) {
    const { passwordHash, ...safeAdmin } = admin;
    return safeAdmin;
  }
}
