import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { SuperAdminGuard } from './super-admin.guard';
import { AdminsModule } from '../admins/admins.module';

@Module({
  imports: [
    ConfigModule,
    AdminsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: configService.get<string>('JWT_EXPIRATION') || '3600s',
        },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, SuperAdminGuard],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
