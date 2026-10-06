import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createPrivateKey } from 'crypto';
import { readFileSync } from 'fs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    ConfigModule,
    ClientsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const privateKeyPath = configService.getOrThrow<string>('JWT_PRIVATE_KEY_PATH');
        const privateKey = readFileSync(privateKeyPath);
        const parsedPrivateKey = createPrivateKey(privateKey);
        if (parsedPrivateKey.asymmetricKeyType !== 'rsa') {
          throw new Error('JWT_PRIVATE_KEY_PATH must point to an RSA private key');
        }

        return {
          privateKey,
          signOptions: {
            algorithm: 'RS256' as const,
            expiresIn: configService.get<string>('JWT_EXPIRATION') || '3600s',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
