import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  // LoginDto caps passwords at 72 characters (bcrypt's limit), so a longer one could never log in.
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/, {
    message: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsNotEmpty()
  @Matches(/^\d{3}-\d{2}-\d{4}$/, {
    message: 'SSN must use the format 123-45-6789.',
  })
  ssn: string;

  @IsNotEmpty()
  @IsDateString()
  dateOfBirth: string;

  @IsNotEmpty()
  @IsPhoneNumber('US', { message: 'Phone number must be a valid US phone number.' })
  @MaxLength(12)
  phoneNumber: string;
}
