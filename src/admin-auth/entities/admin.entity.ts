import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AdminRole } from '../admin-role.enum';

@Entity('admins')
export class AdminEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'admin_id' })
  adminId: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'text', default: 'finance' })
  roles!: AdminRole;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamp', insert: false, update: false })
  createdAt: Date;

  @Column({ type: 'timestamp', insert: false, update: false })
  updated: Date;
}
