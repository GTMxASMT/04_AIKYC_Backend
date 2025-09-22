import dotenv from "dotenv";

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT!),
    nodeEnv: process.env.NODE_ENV!,
    host: process.env.HOST!,
  },
  database: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    username: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN!,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN!,
  },
  webrtc: {
    corsOrigins:
      process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000",
    allowEIO3: process.env.SOCKET_ALLOW_EIO3 === "true" || true,
    upgradeTimeout: parseInt(process.env.SOCKET_UPGRADE_TIMEOUT!),
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT!),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL!),
    transports: process.env.SOCKET_TRANSPORTS?.split(",") || [
      "websocket",
      "polling",
    ],
    sessionCleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL!),
    maxSignalsPerSession: parseInt(process.env.MAX_SIGNALS_PER_SESSION!),
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    s3BucketName: process.env.AWS_S3_BUCKET_NAME!,
  },
  frontend: {
    url: process.env.FRONTEND_URL!,
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== "false",
    enableSocketLogging: process.env.ENABLE_SOCKET_LOGGING !== "false",
  },
};

export const FRONTEND_URL = config.frontend.url;

export const AML_PEP_Rules = [
  {
    id: "R1",
    description: "Exact name + DOB match = High Risk",
    conditions: {
      name_match: "EXACT",
      dob_match: true,
    },
    risk_level: "HIGH",
    action: "ALERT",
  },
  {
    id: "R2",
    description: "Fuzzy name >= 0.85 + Same country = Medium Risk",
    conditions: {
      name_match: "FUZZY",
      threshold: 0.85,
      country_match: true,
    },
    risk_level: "MEDIUM",
    action: "FLAG",
  },
  {
    id: "R3",
    description: "Any SANCTION record = High Risk",
    conditions: {
      type: "SANCTION",
    },
    risk_level: "HIGH",
    action: "BLOCK",
  },
  {
    id: "R4",
    description: "PEP in high office (PM, Minister, MP) = High Risk",
    conditions: {
      type: "PEP",
      positions: ["Prime Minister", "Minister", "Member of Parliament"],
    },
    risk_level: "HIGH",
    action: "ALERT",
  },
  {
    id: "R5",
    description: "PEP in lower office (MLA, Councillor) = Medium Risk",
    conditions: {
      type: "PEP",
      positions: ["MLA", "Municipal Councillor"],
    },
    risk_level: "MEDIUM",
    action: "FLAG",
  },
];
// Enums
export enum UserRole {
  SUPERADMIN = "superadmin",
  ADMIN = "admin",
  USER = "user",
  COORDINATOR = "coordinator",
  

  AGENT = "agent",
}

export enum StatusCode {
  // Success responses
  SUCCESS = 200,
  CREATED = 201,
  NO_CONTENT = 204,

  // Client error responses
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,

  // Server error responses
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

export enum KYCStage {
  NOT_STARTED = 0,
  DOCUMENT_UPLOAD = 1,
  DOCUMENT_PROCESSING = 2,
  LIVENESS_CHECK = 3,
  FACE_VERIFICATION = 4,
  VIDEO_KYC = 5,
  COMPLIANCE_CHECK = 6,
  APPROVED = 7,
  REJECTED = 8,
  FLAGGED = 9,
}

export enum Status {
  PENDING = "pending", 
  FAILED = "failed",
  COMPLETED = "completed",

  REJECTED = "rejected",
  VERIFIED = "verified",
}
