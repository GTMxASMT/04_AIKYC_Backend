import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
} from "class-validator";

// Authentication DTO
export class AuthenticateWebRTCDTO {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsNotEmpty()
  @IsString()
  role!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;
}

// Session Management DTOs
export class CreateSessionDTO {
  @IsNotEmpty()
  @IsString()
  sessionId!: string;
}

export class JoinSessionDTO {
  @IsNotEmpty()
  @IsString()
  sessionId!: string;
}

// Verification DTO
export class ChecklistItemDTO {
  @IsNotEmpty()
  @IsString()
  item!: string;

  @IsNotEmpty()
  @IsBoolean()
  status!: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitVerificationDTO {
  @IsNotEmpty()
  @IsArray()
  checklist!: ChecklistItemDTO[];
}

// Recording DTO
export class UpdateRecordingStatusDTO {
  @IsNotEmpty()
  @IsBoolean()
  isRecording!: boolean;
}
