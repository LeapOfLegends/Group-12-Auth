import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminsController } from './admins.controller';
import { AdminService } from './admin.service';
import { AdminsService } from './admins.service';
import { AdminEntity } from './entities/admin.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AdminEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is required');
        }
        return {
          secret,
          signOptions: {
            algorithm: 'HS256',
          },
        };
      },
    }),
  ],
  controllers: [AdminController, AdminsController],
  providers: [AdminService, AdminsService],
  exports: [AdminsService],
})
export class AdminAuthModule {}
