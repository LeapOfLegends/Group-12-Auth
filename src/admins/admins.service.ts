import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './entities/admin.entity';

// Admins are created by the Spring Boot backend; this service only reads them for login.
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

  toPublicAdmin(admin: Admin) {
    const { passwordHash, ...safeAdmin } = admin;
    return safeAdmin;
  }
}
