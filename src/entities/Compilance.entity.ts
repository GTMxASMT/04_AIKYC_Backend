import { IsEnum, IsNotEmpty, IsOptional } from "class-validator";
import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity({ name: "aml_pep_rules" })
export class Compliance {
  @PrimaryColumn("uuid")
  id!: string;

  @Column()
  @IsNotEmpty({ message: "Name is required" })
  name!: string;

  @Column()
  @IsEnum(["PEP", "CRIMINAL", "AML", "SANCTION", "OTHER"])
  type!: string;

  @Column({ type: "date", nullable: true })
  @IsOptional()
  DOB!: Date;

  @Column()
  source!: string;

  @Column()
  @IsNotEmpty({ message: "Country is required" })
  country!: string;

  @Column()
  @IsNotEmpty({ message: "Reason is required" })
  reason!: string;

  @Column()
  @IsNotEmpty({ message: "Risk level is required" })
  @IsEnum(["LOW", "MEDIUM", "HIGH"])
  risk_level!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  position!: string | null;
}
