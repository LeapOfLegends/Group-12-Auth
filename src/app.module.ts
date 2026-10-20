import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { Client } from './clients/entities/client.entity';
import { Admin } from './admins/entities/admin.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DB_HOST') ?? configService.getOrThrow<string>('DATABASE_HOST'),
        port: Number(configService.get<string>('DB_PORT') ?? configService.getOrThrow<string>('DATABASE_PORT')),
        username: configService.get<string>('DB_USER') ?? configService.getOrThrow<string>('DATABASE_USERNAME'),
        password: configService.get<string>('DB_PASSWORD') ?? configService.getOrThrow<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DB_NAME') ?? configService.getOrThrow<string>('DATABASE_NAME'),
        entities: [Client, Admin, RefreshToken],
        synchronize: false,
      }),
    }),
    ClientsModule,
    AuthModule,
  ],
})
export class AppModule {}
