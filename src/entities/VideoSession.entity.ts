// VideoSession.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User.entity";

@Entity("video_sessions")

@Index(["status"])
export class VideoSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  sessionId!: string;

  @Column({
    type: "enum",
    enum: ["active", "completed", "cancelled"],
    default: "active",
  })
  status!: string;

  @Column()
  createdBy!: string; // Agent/Admin who created the session

  @ManyToOne(() => User)
  @JoinColumn({ name: "createdBy" })
  creator!: User;

  @Column({ type: "json" })
  metadata!: {
    kycSessionId?: string;
    targetUserId: string; // User who should join for KYC
    agentId: string; // Agent who created session
    sessionType: "kyc_verification";
    participants: Array<{
      userId: string;
      name: string;
      email: string;
      role: string;
      joinedAt?: Date;
    }>;
    lastUpdated?: Date;
    recording?: {
      isRecording: boolean;
      startedAt?: Date;
      stoppedAt?: Date;
    };
    forcedClosedBy?: string;
    forcedClosedAt?: Date;
  };

  @Column({ nullable: true })
  recordingUrl?: string;

  @Column({
    type: "enum",
    enum: ["approved", "rejected", "pending"],
    nullable: true,
  })
  verificationStatus?: string;

  @Column({ type: "json", nullable: true })
  verificationData?: {
    checklist: Array<{
      id: string;
      item: string;
      status: boolean;
      notes?: string;
    }>;
    status: "approved" | "rejected" | "pending";
    notes?: string;
  };

  @Column({ nullable: true })
  verifiedBy?: string; // Agent who submitted verification

  @Column({ type: "datetime", nullable: true })
  verifiedAt?: Date;

  @Column({ type: "datetime", nullable: true })
  startedAt?: Date; // Recording start time

  @Column({ type: "datetime", nullable: true })
  endedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Computed properties
  get participantCount(): number {
    return this.metadata?.participants?.length || 0;
  }

  get hasAgent(): boolean {
    return (
      this.metadata?.participants?.some(
        (p) => p.role === "agent" || p.role === "admin"
      ) || false
    );
  }

  get hasUser(): boolean {
    return this.metadata?.participants?.some((p) => p.role === "user") || false;
  }

  get sessionDuration(): number | null {
    if (!this.startedAt || !this.endedAt) return null;
    return Math.floor(
      (this.endedAt.getTime() - this.startedAt.getTime()) / 1000
    );
  }

  get isKYCSession(): boolean {
    return this.metadata?.sessionType === "kyc_verification";
  }

  get targetUser(): any {
    return this.metadata?.participants?.find((p) => p.role === "user");
  }

  get sessionAgent(): any {
    return this.metadata?.participants?.find(
      (p) => p.role === "agent" || p.role === "admin"
    );
  }

  // Method to safely update metadata
  updateMetadata(updates: Partial<VideoSession["metadata"]>): void {
    this.metadata = {
      ...this.metadata,
      ...updates,
      lastUpdated: new Date(),
    };
  }

  // Method to add participant
  addParticipant(participant: {
    userId: string;
    name: string;
    email: string;
    role: string;
    joinedAt?: Date;
  }): void {
    if (!this.metadata.participants) {
      this.metadata.participants = [];
    }

    // Remove existing participant with same userId (prevent duplicates)
    this.metadata.participants = this.metadata.participants.filter(
      (p) => p.userId !== participant.userId
    );

    // Add new participant
    this.metadata.participants.push(participant);
    this.metadata.lastUpdated = new Date();
  }

  // Method to remove participant
  removeParticipant(userId: string): void {
    if (this.metadata.participants) {
      this.metadata.participants = this.metadata.participants.filter(
        (p) => p.userId !== userId
      );
      this.metadata.lastUpdated = new Date();
    }
  }

  // Method to get participant by role
  getParticipantByRole(role: string): any {
    return this.metadata.participants?.find((p) => p.role === role);
  }

  // Method to check if session is ready (has required participants)
  isReadyForKYC(): boolean {
    return this.hasAgent && this.hasUser && this.participantCount === 2;
  }

  // Method to validate session state
  validateSession(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.metadata.targetUserId) {
      errors.push("Target user ID is required");
    }

    if (!this.metadata.agentId) {
      errors.push("Agent ID is required");
    }

    if (this.participantCount > 2) {
      errors.push("Session cannot have more than 2 participants");
    }

    if (this.status === "active" && this.participantCount === 0) {
      errors.push("Active session must have at least one participant");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
