import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  Length,
  IsPhoneNumber,
} from "class-validator";

export class CreateUserDTO {
  @IsNotEmpty({ message: "Name is required" })
  @Length(2, 100, { message: "Name must be between 2 and 100 characters" })
  name!: string;

  @IsEmail({}, { message: "Please provide a valid email address" })
  @IsNotEmpty({ message: "Email is required" })
  email!: string;

  @IsNotEmpty({ message: "Password is required" })
  @Length(6, 255, { message: "Password must be at least 6 characters long" })
  password!: string;

  @IsOptional()
  @IsPhoneNumber("IN", { message: "Please provide a valid phone number" })
  phone?: string;
}

export class UpdateUserDTO {
  @IsOptional()
  @Length(2, 100, { message: "Name must be between 2 and 100 characters" })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Please provide a valid email address" })
  email?: string;

  @IsOptional()
  @IsPhoneNumber("IN", { message: "Please provide a valid phone number" })
  phone?: string;
}

export class LoginDTO {
  @IsEmail({}, { message: "Please provide a valid email address" })
  @IsNotEmpty({ message: "Email is required" })
  email!: string;

  @IsNotEmpty({ message: "Password is required" })
  password!: string;
}

export class RefreshTokenDTO {
  @IsNotEmpty({ message: "Refresh token is required" })
  refreshToken!: string;
}
