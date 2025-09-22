import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import { User } from "../entities/User.entity";
import { UserKYCSession } from "../entities/UserKYCSession.entity";
import { AppDataSource } from "../database/db";
import { ApiError } from "../utilities/ApiError";
import { Compliance } from "../entities/Compilance.entity";
import { KYCStage, Status, StatusCode, UserRole } from "../config";
import {
  AcceptedConfig,
  KYCDocumentsConfig,
  RequiredConfig,
} from "../entities/KYCDocumentsConfig";
import { formatTime_ms_string } from "../utilities/formatDate";
import generateTokens from "../utilities/generateTokens";
import verifyCaptcha from "../utilities/verifyCaptcha";

export class AdminService {
  private userRepository: Repository<User>;
  private KYCSessionRepository: Repository<UserKYCSession>;
  private AML_PEP: Repository<Compliance>;
  private configRepository: Repository<KYCDocumentsConfig>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
    this.KYCSessionRepository = AppDataSource.getRepository(UserKYCSession);
    this.AML_PEP = AppDataSource.getRepository(Compliance);
    this.configRepository = AppDataSource.getRepository(KYCDocumentsConfig);
  }

  // -------------------------------- ADMIN LOGIN ------------------------------

  async login(
    loginData: { email: string; password: string },
    gretoken: string
  ): Promise<{ user: User; tokens: any }> {
    console.log("login data:", loginData);

    const user = await this.userRepository.findOne({
      where: {
        email: loginData.email,
        // role: UserRole.ADMIN || UserRole.COORDINATOR || UserRole.SUPERADMIN,
        isActive: true,
      },
    });

    if (!user) {
      console.log("user not found");
      throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await user.comparePassword(loginData.password);
    console.log("isPasswordValid", isPasswordValid);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid email or password");
    }

    // if (!loginData.gtm) {
    //   const captcha = await verifyCaptcha(gretoken);

    //   if (!captcha) {
    //     console.log("Captcha token verification failed");
    //     throw new ApiError(400, "Captcha token verification failed");
    //   }
    // }
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;

    await this.userRepository.save(user);

    return { user, tokens };
  }

  // Logout user
  async logout(userId: string): Promise<void> {
    await this.userRepository.update(userId, { refreshToken: undefined });
  }
  async getAllUsers(
    page: number = 1,
    limit: number = 15
  ): Promise<{ users: User[]; total: number; totalPages: number }> {
    const [users, total] = await this.userRepository.findAndCount({
      where: { isActive: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: "DESC" },
    });

    return {
      users,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
  async getAllUsers__(
    page: number = 1,
    limit: number = 15
  ): Promise<{ users: any[]; total: number; totalPages: number }> {
    const [users, total] = await this.userRepository.findAndCount({
      where: { isActive: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: "DESC" },
    });

    const _users = users
      .filter((user) => user.role === UserRole.USER)
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        DOB: user.DOB,
        "Profile Image": user.profileImage,
        Verified: user.Verified,
        "Current Stage": user.currentStage,
        country: user.country,
        createdAt: user.createdAt,
      }));
    return {
      users: _users,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllUsersByFilter(
    from?: Date,
    to?: Date
  ): Promise<{ data: User[]; count: number[]; labels: string[] }> {
    const where: any = { isActive: true, role: UserRole.USER };
    if (from && to) {
      where.createdAt = Between(from, to);
    } else if (from) {
      where.createdAt = MoreThanOrEqual(from);
    } else if (to) {
      where.createdAt = LessThanOrEqual(to);
    }
    const filteredData = await this.getAllUsers__();

    // const createdAtLabels = filteredData.users
    //   .map((user) => user?.createdAt?.toISOString().split("T")[0])
    //   .sort();

    const grouped = new Map<string, number>();
    filteredData.users.forEach((user) => {
      const date = user.createdAt.toISOString().split("T")[0]; // yyyy-mm-dd
      grouped.set(date, (grouped.get(date) ?? 0) + 1);
    });

    const countData = [...grouped.values()];
    const createdAtLabels = [...grouped.keys()];
    return {
      data: filteredData.users,
      count: countData,
      labels: createdAtLabels,
    };
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: ["KYCSessions"],
    });
  }

  async updateUser(
    userId: string,
    userData: Partial<User>
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    // Only allow updating specific fields for admin
    const allowedFields = [
      "name",
      "email",
      "phone",
      "role",
      "currentStage",
      "isActive",
    ];
    const filteredData: Partial<User> = {};

    allowedFields.forEach((field) => {
      if (userData[field as keyof User] !== undefined) {
        (filteredData as any)[field] = userData[field as keyof User];
      }
    });

    Object.assign(user, filteredData);
    return this.userRepository.save(user);
  }

  async deleteUser(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return false;
    }

    await this.userRepository.remove(user);
    return true;
  }

  // KYC Session Methods (based on your existing methods)
  async getAllKYCSessions(): Promise<UserKYCSession[]> {
    return this.KYCSessionRepository.find({
      where: {},
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }
  async getAllPendingKYCSessions(): Promise<UserKYCSession[]> {
    return this.KYCSessionRepository.find({
      where: { status: Status.PENDING },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }

  async getAllKYCSessionsByStatus(status: Status): Promise<UserKYCSession[]> {
    return this.KYCSessionRepository.find({
      where: { status },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }

  async getAllKYCSessionsByFilters(
    from?: Date,
    to?: Date
  ): Promise<{ data: UserKYCSession[]; count: number[]; labels: string[] }> {
    const where: any = {};

    if (from && to) {
      where.createdAt = Between(from, to);
    } else if (from) {
      where.createdAt = MoreThanOrEqual(from);
    } else if (to) {
      where.createdAt = LessThanOrEqual(to);
    }

    const filteredData = await this.KYCSessionRepository.find({
      where,
      relations: ["user"],
      order: { createdAt: "DESC" },
    });

    console.log("Filtered Data Length:", filteredData.length);

    const grouped = new Map<string, number>();

    filteredData.forEach((user) => {
      const date = user.createdAt.toISOString().split("T")[0];
      grouped.set(date, (grouped.get(date) ?? 0) + 1);
    });

    const countData = [...grouped.values()];
    const createdAtLabels = [...grouped.keys()];

    return { data: filteredData, count: countData, labels: createdAtLabels };
  }

  async getKYCSessionById(sessionId: string): Promise<UserKYCSession | null> {
    return this.KYCSessionRepository.findOne({
      where: { id: sessionId },
      relations: ["user"],
    });
  }

  async getKYCSessionByUserId(userId: string): Promise<UserKYCSession | null> {
    return this.KYCSessionRepository.findOne({
      where: { user: { id: userId } },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
  }

  async updateKYCSessionStatus(
    sessionId: string,
    status: Status
  ): Promise<UserKYCSession | null> {
    const session = await this.KYCSessionRepository.findOne({
      where: { id: sessionId },
      relations: ["user"],
    });

    if (!session) {
      return null;
    }

    session.status = status;
    const updatedSession = await this.KYCSessionRepository.save(session);

    // Update user's stage based on KYC status
    if (status === "verified" && session.user) {
      session.user.currentStage = session.user.currentStage; // Keep current or advance based on your logic
      await this.userRepository.save(session.user);
    }

    return updatedSession;
  }

  async getAll_AML_PEP_List(): Promise<Compliance[]> {
    return this.AML_PEP.find();
  }

  async insertEntities(data: Compliance[]): Promise<Compliance[]> {
    // validate / sanitize if needed
    const entities = this.AML_PEP.create(data); // prepare entities
    return await this.AML_PEP.save(entities); // bulk insert
  }

  async completeComplianceCheck(
    userId: string,
    sessionId: string,
    adminId: string,
    decision: "approved" | "rejected",
    notes?: string
  ): Promise<any> {
    const session = await this.KYCSessionRepository.findOne({
      where: { id: sessionId, userId: userId },
    });

    if (!session) {
      throw new ApiError(404, "KYC session not found");
    }

    // Verify all EPICs are completed
    if (
      session.EPIC1?.status !== "completed" ||
      session.EPIC2?.status !== "completed" ||
      session.EPIC3?.status !== "completed"
    ) {
      throw new ApiError(
        400,
        "All KYC stages must be completed before compliance check"
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (decision === "approved") {
      // Mark user as verified and move to completed stage
      user.Verified = true;
      user.updateKYCStage(KYCStage.APPROVED);
      session.status = Status.VERIFIED;
    } else {
      // Reject the user
      user.updateKYCStage(KYCStage.REJECTED);
      session.status = Status.REJECTED;
    }

    await this.userRepository.save(user);
    await this.KYCSessionRepository.save(session);

    console.log(
      "--------------------------- COMPLIANCE CHECK ---------------------------\n"
    );
    console.log("Admin ID\t:\t", adminId);
    console.log("User ID\t:\t", userId);
    console.log("Session ID\t:\t", sessionId);
    console.log("Decision\t:\t", decision);
    console.log("User Verified\t:\t", user.Verified);
    console.log("Final Stage\t:\t", user.currentStage);
    console.log(
      "\n---------------------------------------------------------------------\n"
    );

    return {
      sessionId: session.id,
      userId: userId,
      decision,
      userVerified: user.Verified,
      currentStage: user.currentStage,
      notes,
      processedBy: adminId,
      processedAt: new Date().toISOString(),
    };
  }

  // Updated methods for AdminService class

// Helper: Count true values in documents object
private countTrueDocs(docs: { [key: string]: boolean }): number {
  return Object.values(docs).filter(Boolean).length;
}

// Helper: Get document names that are true
private getTrueDocNames(docs: { [key: string]: boolean }): string[] {
  return Object.entries(docs)
    .filter(([_, value]) => value === true)
    .map(([key]) => key);
}

// Get current active configuration
private async getActiveConfig(): Promise<KYCDocumentsConfig> {
  console.log("Fetching active KYC document configuration...");
  let config = await this.configRepository.findOne({
    where: { isActive: true },
  });

  if (!config) {
    const defaultAccepted: AcceptedConfig = {
      documents: {
        aadhaar: true,
        pan: true,
        passport: false,
      },
      acceptedDocumentsCount: 2,
    };

    const defaultRequired: RequiredConfig = {
      totalRequiredDocumentsCount: 1,
      requiredDocumentOptions: {"1": ["aadhaar"], "2": [], "3": []},
      leftDocs: ["pan", "passport"]
    };

    console.log("No active config found, creating default configuration.");
    config = this.configRepository.create({
      accepted: defaultAccepted,
      required: defaultRequired,
      isActive: true,
      updatedBy: "SYSTEM",
    });
    console.log("Default Config:", config);
    await this.configRepository.save(config);
    console.log("Default configuration saved.");
  }

  return config;
}

// GET /admin/accepted-documents
async getAcceptedDocuments(): Promise<AcceptedConfig> {
  const config = await this.getActiveConfig();
  return config.accepted;
}

// GET /admin/required-documents
async getRequiredDocuments(): Promise<RequiredConfig> {
  const config = await this.getActiveConfig();
  return config.required;
}

// POST /admin/accepted-documents
async setAcceptedDocuments(
  acceptedConfig: AcceptedConfig,
  updatedBy: string
): Promise<void> {
  console.log("Accepted Config Received:", acceptedConfig);

  // Validate the accepted configuration structure
  const requiredDocTypes = ['aadhaar', 'pan', 'passport'];
  
  // Ensure all required document types are present
  for (const docType of requiredDocTypes) {
    if (typeof acceptedConfig.documents[docType as keyof typeof acceptedConfig.documents] !== 'boolean') {
      throw new ApiError(400, `Document type '${docType}' must be a boolean value`);
    }
  }

  // Validate acceptedDocumentsCount matches actual count
  const actualAcceptedCount = this.countTrueDocs(acceptedConfig.documents);
  if (actualAcceptedCount !== acceptedConfig.acceptedDocumentsCount) {
    throw new ApiError(
      400, 
      `acceptedDocumentsCount (${acceptedConfig.acceptedDocumentsCount}) does not match actual count of accepted documents (${actualAcceptedCount})`
    );
  }

  // At least one document must be accepted
  if (actualAcceptedCount === 0) {
    throw new ApiError(400, "At least one document type must be accepted");
  }

  // Get current configuration
  const config = await this.getActiveConfig();

  // Get currently accepted document names
  const newAcceptedDocNames = this.getTrueDocNames(acceptedConfig.documents);
  console.log("New Accepted Document Names:", newAcceptedDocNames);

  // Check if any required documents are being removed from accepted list
  const requiredDocs = [
    ...config.required.requiredDocumentOptions['1'],
    ...config.required.requiredDocumentOptions['2'],
    ...config.required.requiredDocumentOptions['3']
  ];

  const invalidRequired = requiredDocs.filter(
    (reqDoc) => !newAcceptedDocNames.includes(reqDoc)
  );

  if (invalidRequired.length > 0) {
    throw new ApiError(
      400,
      `Cannot remove documents that are set as required: ${invalidRequired.join(", ")}`
    );
  }

  console.log("Updating accepted documents to:", newAcceptedDocNames);

  // Update the configuration
  config.accepted = acceptedConfig;
  config.updatedBy = updatedBy;
  config.updatedAt = new Date();
  
  await this.configRepository.save(config);
  console.log("Accepted documents configuration updated successfully");
}

// PUT /admin/required-documents
async setRequiredDocuments(
  requiredConfig: RequiredConfig,
  updatedBy: string
): Promise<void> {
  console.log("Required Config Received:", requiredConfig);

  // Validate the required configuration structure
  const validDocTypes = ['aadhaar', 'pan', 'passport'];
  const validSlots = ['1', '2', '3'];

  // Validate totalRequiredDocumentsCount
  if (requiredConfig.totalRequiredDocumentsCount < 0 || 
      requiredConfig.totalRequiredDocumentsCount > 3) {
    throw new ApiError(400, "totalRequiredDocumentsCount must be between 0 and 3");
  }

  // Validate requiredDocumentOptions structure
  for (const slot of validSlots) {
    if (!Array.isArray(requiredConfig.requiredDocumentOptions[slot as keyof typeof requiredConfig.requiredDocumentOptions])) {
      throw new ApiError(400, `requiredDocumentOptions['${slot}'] must be an array`);
    }

    // Validate each document in the slot
    for (const doc of requiredConfig.requiredDocumentOptions[slot as keyof typeof requiredConfig.requiredDocumentOptions]) {
      if (!validDocTypes.includes(doc)) {
        throw new ApiError(
          400, 
          `Invalid document type '${doc}' in slot '${slot}'. Must be one of: ${validDocTypes.join(', ')}`
        );
      }
    }
  }

  // Validate leftDocs array
  if (!Array.isArray(requiredConfig.leftDocs)) {
    throw new ApiError(400, "leftDocs must be an array");
  }

  for (const doc of requiredConfig.leftDocs) {
    if (!validDocTypes.includes(doc)) {
      throw new ApiError(
        400, 
        `Invalid document type '${doc}' in leftDocs. Must be one of: ${validDocTypes.join(', ')}`
      );
    }
  }

  // Validate that all documents are accounted for (no missing, no extras)
  const allRequiredDocs = [
    ...requiredConfig.requiredDocumentOptions["1"],
    ...requiredConfig.requiredDocumentOptions["2"],
    ...requiredConfig.requiredDocumentOptions["3"],
    ...requiredConfig.leftDocs,
  ];

  const uniqueDocs = [...new Set(allRequiredDocs)];
  if (uniqueDocs.length !== validDocTypes.length || 
      !validDocTypes.every(doc => uniqueDocs.includes(doc))) {
    throw new ApiError(
      400, 
      "All document types must be accounted for across requiredDocumentOptions and leftDocs"
    );
  }

  // Validate no duplicate documents across requirement slots
  const requiredDocs = [
    ...requiredConfig.requiredDocumentOptions['1'],
    ...requiredConfig.requiredDocumentOptions['2'],
    ...requiredConfig.requiredDocumentOptions['3']
  ];
  if (requiredDocs.length !== [...new Set(requiredDocs)].length) {
    throw new ApiError(400, "Duplicate documents found across requirement slots");
  }

  // Get current configuration to check against accepted documents
  const config = await this.getActiveConfig();
  const acceptedDocNames = this.getTrueDocNames(config.accepted.documents);

  // Check if required documents are in accepted list
  const invalidRequired = requiredDocs.filter(
    (reqDoc) => !acceptedDocNames.includes(reqDoc)
  );

  if (invalidRequired.length > 0) {
    throw new ApiError(
      400,
      `These required documents are not in accepted list: ${invalidRequired.join(", ")}`
    );
  }

  console.log("Updating required documents configuration");

  // Update the configuration
  config.required = requiredConfig;
  config.updatedBy = updatedBy;
  config.updatedAt = new Date();
  
  await this.configRepository.save(config);
  console.log("Required documents configuration updated successfully");
}

  // Helper func- validate user's documents against current config

  // -----------------------------------------------------------------------

  async KPIService(): Promise<any> {
    const TotalKYCs = await this.getAllKYCSessions();

    const completedKYCs = TotalKYCs.filter(
      (session) => session.status === Status.COMPLETED
    );

    const rejectedKYCs = TotalKYCs.filter(
      (session) => session.status === Status.REJECTED
    );

    const TAT = completedKYCs
      .map((session) => {
        const createdAt = session.createdAt;
        const completedAt = session.completedAt;
        if (createdAt && completedAt && completedAt > createdAt) {
          const timeDiff =
            new Date(completedAt).getTime() - new Date(createdAt).getTime();
          if (timeDiff < 0) {
            console.error(`Inconsistent timestamps for session ${session.id}`);
            throw new ApiError(
              StatusCode.INTERNAL_SERVER_ERROR,
              `Inconsistent timestamps for session ${session.id}`
            );
          }

          return timeDiff;
        }
        return undefined;
      })
      .filter((t) => typeof t === "number");

    const avgTAT =
      TAT.length > 0
        ? TAT.reduce((acc, curr) => acc + curr, 0) / TAT.length
        : 0;

    const duration = formatTime_ms_string(avgTAT);
    const rejectionRate = (rejectedKYCs?.length / TotalKYCs?.length) * 100 || 0;

    const totalFaceMatch = TotalKYCs.map((session) => session.EPIC2?.data);

    const FaceMatchScore =
      totalFaceMatch.length > 0
        ? (totalFaceMatch.filter((data) => data && data?.isMatch === true)
            .length /
            totalFaceMatch.length) *
          100
        : 0;

    const KPIs = {
      "Total KYCs": completedKYCs.length,
      "Average TAT": duration,
      "Rejection Rate": `${rejectionRate.toFixed(2)} %`,
      "Face Match Score": `${FaceMatchScore.toFixed(2)} %`,
    };
  }
}
