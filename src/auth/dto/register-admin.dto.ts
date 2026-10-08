import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AdminRole } from '../admin-role';

export class RegisterAdminDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,50}$/)
  username!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;
}
