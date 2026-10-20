import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  refreshToken: string;
}
