import { IsEnum } from 'class-validator';
import { AdminRole } from '../admin-role.enum';

export class UpdateAdminRoleDto {
  @IsEnum(AdminRole)
  role: AdminRole;
}
