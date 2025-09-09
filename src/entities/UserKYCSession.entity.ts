import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from "typeorm";
import { User } from "./User.entity";
import { Status } from "../config";

@Entity("kyc_sessions")
export class UserKYCSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: false }) 
  userId!: string;

  @ManyToOne(() => User,  {onDelete: "CASCADE", onUpdate: "CASCADE",})
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ default: "pending" })
  status!: Status; 

  @Column({ type: "text", nullable: true })
  fileURL?: string;

  // EPIC1 - Document Processing Results
  @Column({ type: "json", nullable: true })
  EPIC1?: {
    status?: Status;
    message?: string;
    data?: any;
    meta?: any;
  };

  // EPIC2 - Face Comparison Results
  @Column({ type: "json", nullable: true })
  EPIC2?: {
    status?: Status;
    message?: string;
    data?: any;
    meta?: any;
  };

  // EPIC3 - Video KYC
  @Column({ type: "json", nullable: true })
  EPIC3?: {
    status?: Status;
    message?: string;
    data?: any; //checklist
    meta?: any;
  };

  // @Column({ type: "json", nullable: true })
  // EPICs?: {
  //   EPIC: string; // "EPIC1" | "EPIC2" | "EPIC3"
  //   message?: string;
  //   data?: any;
  //   meta?: any;
  // }[];

  @Column({ type: "varchar", length: 50, nullable: true })
  documentType?: string;

  @CreateDateColumn()
  createdAt!: Date;

  //completetAT date column
  @Column({ type: "timestamp", nullable: true })
  completedAt?: Date;
}
