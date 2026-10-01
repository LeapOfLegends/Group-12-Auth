import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
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

  @IsNotEmpty()
  @Matches(/^\d{3}-\d{2}-\d{4}$/, {
    message: 'SSN must use the format 123-45-6789.',
  })
  ssn: string;

  @IsNotEmpty()
  @IsPhoneNumber('US', { message: 'Phone number must be a valid US phone number.' })
  phoneNumber: string;
}
