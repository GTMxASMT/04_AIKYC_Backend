import { Repository } from "typeorm";
import { User } from "../entities/User.entity";
import { UserKYCSession } from "../entities/UserKYCSession.entity";
import { AppDataSource } from "../database/db";
import { ApiError } from "../utilities/ApiError";
import { Compilance } from "../entities/Compilance.entity";
import { KYCStage, Status } from "../config";

export class AdminService {
  private userRepository: Repository<User>;
  private KYCSessionRepository: Repository<UserKYCSession>;
  private AML_PEP: Repository<Compilance>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
    this.KYCSessionRepository = AppDataSource.getRepository(UserKYCSession);
    this.AML_PEP = AppDataSource.getRepository(Compilance);
  }

  // User Management Methods (matching controller requirements)
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

  async getAll_AML_PEP_List(): Promise<Compilance[]> {
    return this.AML_PEP.find();
  }

  async insertEntities(data: Compilance[]): Promise<Compilance[]> {
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
      user.updateKYCStage(KYCStage.COMPLETED);
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
}
