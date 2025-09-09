import { DataSource } from "typeorm";
import { config } from "../config";
import { User } from "../entities/User.entity";
import { UserKYCSession } from "../entities/UserKYCSession.entity";
import { UserChat } from "../entities/UserChat.entity";
import { VideoSession } from "../entities/VideoSession.entity";
import { Compliance } from "../entities/Compilance.entity";
import { KYCDocumentsConfig } from "../entities/KYCDocumentsConfig";

export const AppDataSource = new DataSource({
  type: "mysql",
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  synchronize: config.server.nodeEnv === "development",
  logging: false,
  entities: [
    User,
    UserKYCSession,
    UserChat,
    VideoSession,
    Compliance,
    KYCDocumentsConfig,
  ],
  migrations: [],
  subscribers: [],
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log("Database connected successfully");
  } catch (error) {
    console.error(" Database connection error:", error);
    process.exit(1);
  }
};
