import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export interface AcceptedConfig {
  documents: {
    aadhaar: boolean;  // Note: changed from 'aadhar' to 'aadhaar' to match your format
    pan: boolean;
    passport: boolean;
  };
  acceptedDocumentsCount: number;
}

export interface RequiredConfig {
  totalRequiredDocumentsCount: number;
  requiredDocumentOptions: {
    "1": string[];
    "2": string[];
    "3": string[];
  };
  leftDocs: string[];
}

@Entity()
export class KYCDocumentsConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "json",
    comment: "Accepted documents configuration",
  })
  accepted!: AcceptedConfig;

  @Column({
    type: "json",
    comment:
      "Required documents configuration with count and specific requirements",
  })
  required!: RequiredConfig;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
  })
  updatedBy!: string;
}
