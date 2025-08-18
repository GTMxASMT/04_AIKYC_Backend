import dotenv from "dotenv";

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || "5000"),
    nodeEnv: process.env.NODE_ENV || "development",
  },
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    username: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "nodejs_backend",
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "fallback_access_secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_REGION || "us-east-1",
    s3BucketName: process.env.AWS_S3_BUCKET_NAME || "",
  },
  frontend: {
    url: process.env.FRONTEND_URL || "http://localhost:3000",
  },
};

// Enums
export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}
