import { IsEmail, IsEnum, IsString, MinLength, Matches } from 'class-validator';
import { AdminRole } from '../admin-role.enum';

export class RegisterAdminDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  @Matches(/@admin\.com$/, { message: 'Email must end with @admin.com' })
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(AdminRole)
  role: AdminRole;
}
