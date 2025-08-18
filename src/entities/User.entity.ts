import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  Length,
  IsPhoneNumber,
  IsEnum,
} from "class-validator";
import bcrypt from "bcrypt";
import { UserRole } from "../config";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  @IsNotEmpty({ message: "Name is required" })
  @Length(2, 100, { message: "Name must be between 2 and 100 characters" })
  name!: string;

  @Column({ type: "varchar", length: 255, unique: true })
  @IsEmail({}, { message: "Please provide a valid email address" })
  @IsNotEmpty({ message: "Email is required" })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  @IsNotEmpty({ message: "Password is required" })
  @Length(6, 255, { message: "Password must be at least 6 characters long" })
  password!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  @IsOptional()
  @IsPhoneNumber("IN", { message: "Please provide a valid phone number" })
  phone?: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.USER,
  })
  @IsEnum(UserRole, { message: "Role must be either admin or user" })
  role!: UserRole;

  @Column({ type: "varchar", length: 500, nullable: true })
  profileImage?: string;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "varchar", length: 500, nullable: true })
  refreshToken?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.password && !this.password.startsWith("$2b$")) {
      const saltRounds = 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
    }
  }

  async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // Remove sensitive data when converting to JSON
  toJSON() {
    const { password, refreshToken, ...publicData } = this;
    return publicData;
  }
}
