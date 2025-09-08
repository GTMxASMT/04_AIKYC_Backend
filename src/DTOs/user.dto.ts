import {
  IsString,
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

  @IsOptional({ message: "Captcha token is required" })
  gretoken!: string;

  @IsOptional({ message: "gtm property token is required" })
  gtm!: boolean;

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

  @IsOptional({ message: "gretoken is required" })
  gretoken!: string;

  @IsOptional()
  gtm!: boolean;
}

export class RefreshTokenDTO {
  @IsOptional()
  @IsString({ message: "Refresh token must be a string" })
  refreshToken?: string;
}
