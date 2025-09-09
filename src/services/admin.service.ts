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

  // async getAllUsers(): Promise<User[]> {
  //   const users = await this.userRepository.find({
  //     relations: ["KYCSessions"],
  //     order: { createdAt: "DESC" },
  //   });

  //   return users;
  // }

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

  // Helper: Count true values in documents object
  private countTrueDocs(docs: any): number {
    return Object.entries(docs).filter(
      ([key, value]) => key !== "any" && value === true
    ).length;
  }

  // Helper: Get document names that are true (excluding 'any')
  private getTrueDocNames(docs: any): string[] {
    return Object.entries(docs)
      .filter(([key, value]) => key !== "any" && value === true)
      .map(([key]) => key.toUpperCase());
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
          aadhar: true,
          pan: true,
          passport: false,
        },
        totalDocumentsCount: 3,
        acceptedDocumentsCount: 2,
      };

      const defaultRequired: RequiredConfig = {
        documents: {
          aadhar: false,
          pan: false,
          passport: false,
          any: true,
        },
        totalRequiredDocumentsCount: 1,
        selectedRequiredDocumentsCount: 1,
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

  //GET /admin/accepted-documents
  async getAcceptedDocuments(): Promise<AcceptedConfig> {
    const config = await this.getActiveConfig();
    return config.accepted;
  }

  //GET /admin/required-documents
  async getRequiredDocuments(): Promise<RequiredConfig> {
    const config = await this.getActiveConfig();
    return config.required;
  }

  //POST /admin/accepted-documents
  async setAcceptedDocuments(
    acceptedConfig: AcceptedConfig,
    updatedBy: string
  ): Promise<void> {
    console.log("Accepted Config Received:", acceptedConfig);
    const acceptedCount = this.countTrueDocs(acceptedConfig.documents);

    if (acceptedCount === 0) {
      throw new ApiError(400, "At least one document must be accepted");
    }

    const config = await this.getActiveConfig();

    const acceptedDocNames = this.getTrueDocNames(acceptedConfig.documents);
    console.log("Accepted Document Names:", acceptedDocNames);

    const requiredDocNames = this.getTrueDocNames(config.required.documents);
    console.log("Currently Required Document Names:", requiredDocNames);

    const invalidRequired = requiredDocNames.filter(
      (reqDoc) => !acceptedDocNames.includes(reqDoc)
    );

    console.log("Invalid Required Documents:", invalidRequired);

    if (invalidRequired.length > 0) {
      throw new ApiError(
        400,
        `Cannot remove documents that are set as required: ${invalidRequired.join(
          ", "
        )}`
      );
    }

    console.log("Updating accepted documents to:", acceptedDocNames);

    config.accepted = acceptedConfig;
    config.updatedBy = updatedBy;
    await this.configRepository.save(config);
  }

  //PUT /admin/required-documents
  async setRequiredDocuments(
    requiredConfig: RequiredConfig,
    updatedBy: string
  ): Promise<void> {
    const specificRequiredCount = this.countTrueDocs(requiredConfig.documents);

    // Validation: If specific documents are required, count should make sense

    const config = await this.getActiveConfig();

    // Check if required specific documents are in accepted list
    const acceptedDocNames = this.getTrueDocNames(config.accepted.documents);
    const requiredDocNames = this.getTrueDocNames(requiredConfig.documents);

    const invalidRequired = requiredDocNames.filter(
      (reqDoc) => !acceptedDocNames.includes(reqDoc)
    );

    if (invalidRequired.length > 0) {
      throw new ApiError(
        400,
        `These required documents are not in accepted list: ${invalidRequired.join(
          ", "
        )}`
      );
    }

    // Logic validation: If all required docs are specific and any=true, that's redundant
    if (
      specificRequiredCount === requiredConfig.totalRequiredDocumentsCount &&
      requiredConfig.documents.any
    ) {
      console.warn(
        "Warning: All required positions are filled with specific docs, 'any' flag is redundant"
      );
    }

    // Update required configuration
    config.required = requiredConfig;
    config.updatedBy = updatedBy;
    await this.configRepository.save(config);
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
