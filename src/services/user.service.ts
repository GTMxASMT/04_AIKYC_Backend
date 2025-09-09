import jwt from "jsonwebtoken";
import { Repository } from "typeorm";

import { config, KYCStage, Status, StatusCode } from "../config";
import { AppDataSource } from "../database/db";
import { CreateUserDTO, UpdateUserDTO, LoginDTO } from "../DTOs/user.dto";
import { rekognition } from "./AWS/rekognition.service";
import { S3Service } from "./AWS/s3.service";
import { User } from "../entities/User.entity";
import { UserKYCSession } from "../entities/UserKYCSession.entity";
import { ApiError } from "../utilities/ApiError";
import { uploadBufferToCloudinary } from "../utilities/cloudinary";
import verifyCaptcha from "../utilities/verifyCaptcha";
import generateTokens from "../utilities/generateTokens";

export class UserService {
  private userRepository: Repository<User>;
  private KYCSessionRepository: Repository<UserKYCSession>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
    this.KYCSessionRepository = AppDataSource.getRepository(UserKYCSession);
  }

  // Register new user
  async register(
    userData: CreateUserDTO,
    gretoken: string
  ): Promise<{ user: User; tokens: any }> {
    const existingUser = await this.userRepository.findOne({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new ApiError(409, "User with this email already exists");
    }

    // console.log("gtm - ", userData.gtm);

    if (!userData.gtm) {
      const captcha = await verifyCaptcha(gretoken);

      if (!captcha) {
        console.log("Captcha token verification failed");
        throw new ApiError(400, "Captcha token verification failed");
      }
    }

    const user = this.userRepository.create(userData);
    const savedUser = await this.userRepository.save(user);

    const tokens = generateTokens(savedUser);

    savedUser.refreshToken = tokens.refreshToken;
    await this.userRepository.save(savedUser);

    return { user: savedUser, tokens };
  }

  // Login user
  async login(
    loginData: LoginDTO,
    gretoken: string
  ): Promise<{ user: User; tokens: any }> {
    console.log("login data:", loginData);
    const user = await this.userRepository.findOne({
      where: { email: loginData.email, isActive: true },
    });

    console.log("user", user);

    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await user.comparePassword(loginData.password);
    console.log("isPasswordValid", isPasswordValid);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid email or password");
    }

    if (!loginData.gtm) {
      const captcha = await verifyCaptcha(gretoken);

      if (!captcha) {
        console.log("Captcha token verification failed");
        throw new ApiError(400, "Captcha token verification failed");
      }
    }
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await this.userRepository.save(user);

    return { user, tokens };
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<{ tokens: any }> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      const user = await this.userRepository.findOne({
        where: {
          id: decoded.id,
          refreshToken: refreshToken,
          isActive: true,
        },
      });

      if (!user) {
        throw new ApiError(401, "Invalid refresh token");
      }

      const tokens = generateTokens(user);
      user.refreshToken = tokens.refreshToken;
      await this.userRepository.save(user);

      return { tokens };
    } catch (error) {
      throw new ApiError(401, "Invalid refresh token");
    }
  }

  // Logout user
  async logout(userId: string): Promise<void> {
    await this.userRepository.update(userId, { refreshToken: undefined });
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, isActive: true },
      relations: ["KYCSessions"],
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return user;
  }

  // Update user
  async updateUser(id: string, updateData: UpdateUserDTO): Promise<User> {
    const user = await this.getUserById(id);

    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateData.email },
      });

      if (existingUser) {
        throw new ApiError(409, "Email already exists");
      }
    }

    Object.assign(user, updateData);
    return await this.userRepository.save(user);
  }

  // Delete user (soft delete)
  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);
    user.isActive = false;
    user.refreshToken = undefined;
    await this.userRepository.save(user);
  }

  // Upload profile image
  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File
  ): Promise<User> {
    const user = await this.getUserById(userId);

    if (user.profileImage) {
      try {
        console.log("Del img from S3");
      } catch (error) {
        console.error("Failed to delete old profile image:", error);
      }
    }

    console.log("Uploading new profile image:", file);

    const imageUrl: any = await uploadBufferToCloudinary(
      file.buffer,
      file.originalname
    );

    user.profileImage = imageUrl.secure_url;

    console.log("Uploaded profile image:", imageUrl?.secure_url);
    return await this.userRepository.save(user);
  }

  // Helper method to update user stage based on session progress
  private async updateUserStage(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: ["KYCSessions"],
    });

    if (!user) return;

    // Get most recent session
    const mostRecentSession = user.KYCSessions.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];

    if (!mostRecentSession) return;

    let newStage = user.currentStage;

    // Stage progression logic based on EPIC completion
    if (mostRecentSession.EPIC1?.status === "completed") {
      newStage = Math.max(newStage, KYCStage.LIVENESS_CHECK);
    }

    if (mostRecentSession.EPIC2?.status === "completed") {
      newStage = Math.max(newStage, KYCStage.VIDEO_KYC);
    }

    if (mostRecentSession.EPIC3?.status === "completed") {
      newStage = Math.max(newStage, KYCStage.COMPLIANCE_CHECK);
    }

    // Check if all EPICs are completed for verification
    const allEpicsCompleted =
      mostRecentSession.EPIC1?.status === "completed" &&
      mostRecentSession.EPIC2?.status === "completed" &&
      mostRecentSession.EPIC3?.status === "completed";

    if (allEpicsCompleted && newStage === KYCStage.COMPLIANCE_CHECK) {
      // Admin will handle COMPLIANCE_CHECK → COMPLETED transition
      // But we can set Verified = true when all EPICs are done
      user.Verified = true;
    }

    // Update stage if it has progressed
    if (newStage > user.currentStage) {
      user.updateKYCStage(newStage);
      await this.userRepository.save(user);
      console.log(
        `User ${userId} stage updated from ${user.currentStage} to ${newStage}`
      );
    }
  }

  // EPIC3 - VIDEO KYC (Placeholder for future implementation)
  async videoKYC(
    userId: string,
    sessionId?: string,
    agentData?: any
  ): Promise<any> {
    // Step 1: Find the session with completed EPIC1 and EPIC2
    let session: UserKYCSession | null;

    if (sessionId) {
      session = await this.KYCSessionRepository.findOne({
        where: { id: sessionId, userId: userId },
      });
    } else {
      session = await this.KYCSessionRepository.findOne({
        where: {
          userId: userId,
          // Both EPIC1 and EPIC2 should be completed
        },
        order: { createdAt: "DESC" },
      });
    }

    if (!session) {
      throw new ApiError(404, "No eligible KYC session found for Video KYC");
    }

    if (
      session.EPIC1?.status !== "completed" ||
      session.EPIC2?.status !== "completed"
    ) {
      throw new ApiError(
        400,
        "Document processing and face verification must be completed before Video KYC"
      );
    }

    // Step 2: Initialize EPIC3
    session.EPIC3 = {
      status: Status.PENDING,
      message: "Video KYC session started",
      data: {
        checklist: {
          agentVerification: false,
          documentReview: false,
          faceComparison: false,
          addressVerification: false,
          signatureVerification: false,
        },
      },
      meta: {
        startedAt: new Date().toISOString(),
        agentId: agentData?.agentId || null,
        sessionType: "video_kyc",
      },
    };

    await this.KYCSessionRepository.save(session);

    console.log(
      "--------------------------- VIDEO KYC STARTED ---------------------------\n"
    );
    console.log("KYC Session ID\t:\t", session.id);
    console.log("User ID\t:\t", userId);
    console.log("Agent ID\t:\t", agentData?.agentId || "TBD");
    console.log(
      "\n-----------------------------------------------------------------------\n"
    );

    return {
      sessionId: session.id,
      status: "started",
      message: "Video KYC session initiated successfully",
      checklist: session.EPIC3.data.checklist,
      // nextSteps: [
      //   "Agent will verify user identity",
      //   "Document details will be reviewed",
      //   "Live face comparison will be performed",
      //   "Address verification will be conducted",
      //   "Signature verification will be completed",
      // ],
    };
  }
  // Complete Video KYC (called after agent verification)
  async completeVideoKYC(
    userId: string,
    sessionId: string,
    verificationData: {
      agentVerification: boolean;
      documentReview: boolean;
      faceComparison: boolean;
      addressVerification: boolean;
      signatureVerification: boolean;
      agentNotes?: string;
    }
  ): Promise<any> {
    const session = await this.KYCSessionRepository.findOne({
      where: { id: sessionId, userId: userId },
    });

    if (!session || !session.EPIC3) {
      throw new ApiError(404, "Video KYC session not found");
    }

    const allChecksCompleted = Object.values(verificationData).every(
      (check, index) =>
        index === Object.values(verificationData).length - 1 || check === true
    );

    if (allChecksCompleted) {
      session.EPIC3 = {
        status: Status.COMPLETED,
        message: "Video KYC completed successfully",
        data: {
          checklist: {
            agentVerification: verificationData.agentVerification,
            documentReview: verificationData.documentReview,
            faceComparison: verificationData.faceComparison,
            addressVerification: verificationData.addressVerification,
            signatureVerification: verificationData.signatureVerification,
          },
          agentNotes: verificationData?.agentNotes || "",
        },
        meta: {
          completedAt: new Date().toISOString(),
          verificationScore: "passed",
        },
      };

      session.status = Status.COMPLETED; // All EPICs done, ready for compliance
      session.completedAt = new Date();
    } else {
      session.EPIC3 = {
        status: Status.FAILED,
        message: "Video KYC verification failed",
        data: {
          checklist: {
            agentVerification: verificationData.agentVerification,
            documentReview: verificationData.documentReview,
            faceComparison: verificationData.faceComparison,
            addressVerification: verificationData.addressVerification,
            signatureVerification: verificationData.signatureVerification,
          },
          agentNotes: verificationData.agentNotes || "",
        },
        meta: {
          failedAt: new Date().toISOString(),
          verificationScore: "failed",
        },
      };
      // Status remains pending for retry
    }

    await this.KYCSessionRepository.save(session);

    // Update user stage if EPIC3 completed successfully
    if (session.EPIC3.status === "completed") {
      await this.updateUserStage(userId);
    }

    console.log(
      "--------------------------- VIDEO KYC COMPLETED ---------------------------\n"
    );
    console.log("KYC Session ID\t:\t", session.id);
    console.log("Status\t:\t", session.EPIC3.status);
    console.log("All Checks Passed\t:\t", allChecksCompleted);
    console.log(
      "\n------------------------------------------------------------------------\n"
    );

    return {
      sessionId: session.id,
      status: session.EPIC3.status,
      message: session.EPIC3.message,
      checklist: session.EPIC3.data.checklist,
      allEpicsCompleted:
        session.EPIC1?.status === "completed" &&
        session.EPIC2?.status === "completed" &&
        session.EPIC3?.status === "completed",
    };
  }

  // Admin function to handle compliance check and final verification

  // Get user's KYC sessions
  async getUserKYCSessions(userId: string): Promise<UserKYCSession[]> {
    return await this.KYCSessionRepository.find({
      where: { userId: userId },
      order: { createdAt: "DESC" },
    });
  }

  // Get specific KYC session
  async getKYCSession(sessionId: string): Promise<UserKYCSession> {
    const session = await this.KYCSessionRepository.findOne({
      where: { id: sessionId },
      relations: ["user"],
    });

    if (!session) {
      throw new ApiError(404, "KYC Session not found");
    }

    return session;
  }

  // Get KYC session with full details
  async getKYCSessionDetails(sessionId: string, userId?: string): Promise<any> {
    const whereClause: any = { id: sessionId };
    if (userId) {
      whereClause.userId = userId;
    }

    const session = await this.KYCSessionRepository.findOne({
      where: whereClause,
      relations: ["user"],
    });

    if (!session) {
      throw new ApiError(404, "KYC Session not found");
    }

    return {
      id: session.id,
      userId: session.userId,
      status: session.status,
      documentType: session.documentType,
      fileURL: session.fileURL,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      epics: {
        EPIC1: session.EPIC1 || null,
        EPIC2: session.EPIC2 || null,
        EPIC3: session.EPIC3 || null,
      },
      progress: {
        documentProcessing: session.EPIC1?.status || Status.PENDING,
        faceVerification: session.EPIC2?.status || Status.PENDING,
        videoKYC: session.EPIC3?.status || Status.PENDING,
      },
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        currentStage: session.user.currentStage,
        verified: session.user.Verified,
      },
    };
  }

  // Get user's current KYC status and progress
  async getUserKYCStatus(userId: string): Promise<any> {
    const user = await this.getUserById(userId);
    const sessions = await this.getUserKYCSessions(userId);

    const mostRecentSession = sessions[0]; // Already ordered by DESC

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currentStage: user.currentStage,
        stageProgress: user.getStageProgress(),
        verified: user.Verified,
        canProceed: mostRecentSession
          ? {
              toDocumentUpload: user.canProceedToStage(
                KYCStage.DOCUMENT_UPLOAD
              ),
              toLivenessCheck: user.canProceedToStage(KYCStage.LIVENESS_CHECK),
              toFaceVerification: user.canProceedToStage(
                KYCStage.FACE_VERIFICATION
              ),
              toVideoKYC: user.canProceedToStage(KYCStage.VIDEO_KYC),
              toCompliance: user.canProceedToStage(KYCStage.COMPLIANCE_CHECK),
            }
          : null,
      },
      currentSession: mostRecentSession
        ? {
            id: mostRecentSession.id,
            status: mostRecentSession.status,
            documentType: mostRecentSession.documentType,
            fileURL: mostRecentSession.fileURL,
            createdAt: mostRecentSession.createdAt,
            completedAt: mostRecentSession.completedAt,
            progress: {
              EPIC1: mostRecentSession.EPIC1?.status || "pending",
              EPIC2: mostRecentSession.EPIC2?.status || "pending",
              EPIC3: mostRecentSession.EPIC3?.status || "pending",
            },
          }
        : null,
      statistics: {
        totalSessions: sessions.length,
        completedSessions: sessions.filter(
          (s) => s.status === "completed" || s.status === "verified"
        ).length,
        rejectedSessions: sessions.filter((s) => s.status === "rejected")
          .length,
        pendingSessions: sessions.filter((s) => s.status === Status.PENDING)
          .length,
      },
      nextSteps: this.getNextStepsForUser(user, mostRecentSession),
    };
  }

  // Helper method to determine next steps for user
  private getNextStepsForUser(user: User, session?: UserKYCSession): string[] {
    const steps: string[] = [];

    switch (user.currentStage) {
      case KYCStage.NOT_STARTED:
        steps.push(
          "Upload a government ID document (Aadhaar, PAN, or Passport)"
        );
        break;

      case KYCStage.DOCUMENT_UPLOAD:
        steps.push("Wait for document processing to complete");
        break;

      case KYCStage.DOCUMENT_PROCESSING:
        if (session?.EPIC1?.status === "completed") {
          steps.push("Start liveness check");
          steps.push("Complete face verification");
        } else {
          steps.push("Wait for document processing to complete");
        }
        break;

      case KYCStage.LIVENESS_CHECK:
        steps.push("Complete liveness check");
        steps.push("Upload selfie for face verification");
        break;

      case KYCStage.FACE_VERIFICATION:
        if (session?.EPIC2?.status === "completed") {
          steps.push("Schedule Video KYC session");
        } else {
          steps.push("Complete face verification");
        }
        break;

      case KYCStage.VIDEO_KYC:
        if (session?.EPIC3?.status === "completed") {
          steps.push("Wait for admin compliance review");
        } else {
          steps.push("Complete Video KYC with our agent");
        }
        break;

      case KYCStage.COMPLIANCE_CHECK:
        steps.push("Your KYC is under compliance review");
        steps.push("You will be notified of the result");
        break;

      case KYCStage.APPROVED:
        steps.push("KYC verification completed successfully!");
        break;

      case KYCStage.REJECTED:
        steps.push("KYC verification was rejected");
        steps.push("Please contact support for assistance");
        break;

      default:
        steps.push("Contact support for assistance");
    }

    return steps;
  }
}
