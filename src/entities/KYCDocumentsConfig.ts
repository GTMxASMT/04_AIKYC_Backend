import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export interface AcceptedConfig {
  documents: {
    aadhar: boolean;
    pan: boolean;
    passport: boolean;
    voter_id: boolean;
    driving_license: boolean;
  };
}

export interface RequiredConfig {
  count: number;
  documents: {
    aadhar: boolean;
    pan: boolean;
    passport: boolean;
    voter_id: boolean;
    driving_license: boolean;
    any: boolean;
  };
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
