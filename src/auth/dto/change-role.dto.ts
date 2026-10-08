import { IsEnum } from 'class-validator';
import { AdminRole } from '../admin-role';
export class ChangeRoleDto {
  @IsEnum(AdminRole) role!: AdminRole;
}
