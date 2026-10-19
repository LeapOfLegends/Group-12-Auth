import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity('refresh_tokens')
@Unique('uq_refresh_tokens_account', ['accountType', 'accountId'])
export class RefreshToken {
  @PrimaryColumn({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'account_type', type: 'varchar', length: 10 })
  accountType: 'client' | 'admin';

  @Column({ name: 'account_id', type: 'bigint' })
  accountId: string;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
