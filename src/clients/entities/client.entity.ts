import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'client_id' })
  clientId: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 11 })
  ssn: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 12 })
  phoneNumber: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  @Column({ name: 'account_balance', type: 'numeric', precision: 40, scale: 16, insert: false, update: false })
  accountBalance: string;

  @Column({ name: 'created_at', type: 'timestamp', insert: false, update: false })
  createdAt: Date;
}