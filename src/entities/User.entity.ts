import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
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
import { KYCStage, UserRole } from "../config";
import { UserKYCSession } from "./UserKYCSession.entity";
import { UserChat } from "./UserChat.entity";

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

  @Column({ type: "varchar", length: 100 })
  @IsNotEmpty({ message: "Password is required" })
  @Length(6, 100, { message: "Password must be at least 6 characters long" })
  password!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  @IsOptional()
  @IsPhoneNumber("IN", { message: "Please provide a valid phone number" })
  phone?: string;

  @Column({ type: "date", nullable: true })
  @IsOptional()
  DOB?: Date;

  @Column({ type: "varchar", nullable: true })
  @IsOptional()
  country?: string;

  @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
  @IsEnum(UserRole, { message: "Role must be either admin, agent or user" })
  role!: UserRole;

  @Column({ type: "varchar", length: 500, nullable: true })
  profileImage?: string;

  @Column({ type: "enum", enum: KYCStage, default: KYCStage.NOT_STARTED })
  currentStage!: KYCStage;

  @Column({ type: "boolean", default: false })
  Verified!: boolean;

  @OneToMany(() => UserKYCSession, (session) => session.user)
  KYCSessions!: UserKYCSession[];

  @OneToMany(() => UserChat, (chat) => chat.user)
  chats!: UserChat[];

  @Column({ type: "timestamp", nullable: true })
  lastChatAt?: Date;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "varchar", length: 500, nullable: true, select: false })
  refreshToken?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  get uploadedDocuments(): number {
    return this.KYCSessions?.length || 0;
  }

  get successfulUploads(): number {
    return (
      this.KYCSessions?.filter(
        (session) =>
          session.status === "completed" || session.status === "verified"
      ).length || 0
    );
  }

  get failedUploads(): number {
    return (
      this.KYCSessions?.filter(
        (session) =>
          session.status === "failed" || session.status === "rejected"
      ).length || 0
    );
  }

  // STAGE MANAGEMENT METHODS
  advanceStage() {
    if (this.currentStage < KYCStage.APPROVED) {
      this.currentStage = this.currentStage + 1;
      this.lastChatAt = new Date();
    }
  }

  updateKYCStage(stage: KYCStage) {
    this.currentStage = stage;
    this.lastChatAt = new Date();
  }

  getStageProgress(): number {
    // Calculate progress percentage based on stage
    const totalStages = Object.keys(KYCStage).length / 2;
    return Math.round((this.currentStage / (totalStages - 1)) * 100);
  }

  canProceedToStage(targetStage: KYCStage): boolean {
    const stageOrder = [
      KYCStage.NOT_STARTED,
      KYCStage.DOCUMENT_UPLOAD,
      KYCStage.DOCUMENT_PROCESSING,
      KYCStage.LIVENESS_CHECK,
      KYCStage.FACE_VERIFICATION,
      KYCStage.VIDEO_KYC,
      KYCStage.COMPLIANCE_CHECK,
      KYCStage.APPROVED,
    ];

    const currentIndex = stageOrder.indexOf(this.currentStage);
    const targetIndex = stageOrder.indexOf(targetStage);

    return targetIndex <= currentIndex + 1;
  }

  // Get user's most recent chat
  get activeChat(): UserChat | undefined {
    return (
      this.chats?.find((chat) => chat.getMessageCount() > 0) || this.chats?.[0]
    );
  }
  get activeKYCSesson() {
    if (!this.KYCSessions || this.KYCSessions.length === 0) return null;

    const active = this.KYCSessions.find((s) => s.status === "pending");

    return (
      active ||
      this.KYCSessions.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0]
    );
  }

  // Password handling
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

  // Updated toJSON method
  toJSON() {
    const {
      password,
      refreshToken,
      createdAt,
      updatedAt,
      lastChatAt,
      isActive,
      ...publicData
    } = this;

    return {
      ...publicData,
      uploads: {
        total: this.uploadedDocuments,
        success: this.successfulUploads,
        failure: this.failedUploads,
      },
      // chatSummary: {
      //   totalChats: this.chats?.length || 0,
      //   totalMessages:
      //     this.chats?.reduce(
      //       (total, chat) => total + chat.getMessageCount(),
      //       0
      //     ) || 0,
      //   lastChatAt: this.lastChatAt,
      // },
      KYCSessions:
        this.KYCSessions?.filter(
          (session) => session.EPIC1 !== null || session.EPIC2 !== null
        )
          ?.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          ?.map((session) => ({
            id: session.id,
            session_status: session.status,
            fileURL: session.fileURL,
            EPIC1: session.EPIC1,
            EPIC2: session.EPIC2,
            EPIC3: session.EPIC3,
            createdAt: session.createdAt,
          })) || [],
    };
  }
}
