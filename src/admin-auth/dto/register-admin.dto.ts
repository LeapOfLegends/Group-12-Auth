import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, Matches, MinLength } from 'class-validator';
import { AdminRole } from '../../admins/admin-role.enum';

export class RegisterAdminDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/, {
    message: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.',
  })
  password: string;

  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastName: string;

  @IsEnum(AdminRole, { message: 'Role must be super_admin, operations, or finance.' })
  role: AdminRole;
}
