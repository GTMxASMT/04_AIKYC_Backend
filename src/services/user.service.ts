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
    const user = await this.userRepository.findOne({
      where: { email: loginData.email, isActive: true },
    });

    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await user.comparePassword(loginData.password);
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

  //------------------------------------- PROCESS DOCUMENT (EPIC1) -------------------------------------------
  // async processDocument(
  //   userId: string,
  //   file: Express.Multer.File
  // ): Promise<any> {
  //   // Validation
  //   if (!userId || typeof userId !== "string") {
  //     throw new ApiError(400, "Invalid user ID provided");
  //   }

  //   const user = await this.userRepository.findOne({
  //     where: { id: userId, isActive: true },
  //     relations: ["KYCSessions"],
  //   });

  //   if (!user) {
  //     throw new ApiError(404, "User not found");
  //   }

  //   if (!file || !file.buffer) {
  //     throw new ApiError(400, "No file uploaded");
  //   }

  //   // Update user stage to DOCUMENT_UPLOAD when first document is uploaded
  //   if (user.currentStage === KYCStage.NOT_STARTED) {
  //     user.updateKYCStage(KYCStage.DOCUMENT_UPLOAD);
  //     await this.userRepository.save(user);
  //   }

  //   // Step 1: Upload file to cloudinary
  //   let uploadedFileUrl: string;
  //   try {
  //     const cloudinaryResult: any = await uploadBufferToCloudinary(
  //       file.buffer,
  //       file.originalname
  //     );
  //     uploadedFileUrl = cloudinaryResult.secure_url;
  //     console.log("File uploaded to Cloudinary:", uploadedFileUrl);
  //   } catch (uploadError) {
  //     console.error("Failed to upload file:", uploadError);
  //     throw new ApiError(500, "Failed to upload file to cloud storage");
  //   }

  //   // Step 2: Create NEW session for each image upload
  //   const session = this.KYCSessionRepository.create({
  //     userId: userId,
  //     status: "pending",
  //     fileURL: uploadedFileUrl,
  //     EPIC1: {
  //       status: "processing",
  //       message: "Document processing started",
  //       data: null,
  //       meta: null,
  //     },
  //   });

  //   const savedSession = await this.KYCSessionRepository.save(session);

  //   // Update stage to DOCUMENT_PROCESSING
  //   if (user.currentStage === KYCStage.DOCUMENT_UPLOAD) {
  //     user.updateKYCStage(KYCStage.DOCUMENT_PROCESSING);
  //     await this.userRepository.save(user);
  //   }

  //   console.log(
  //     "--------------------------- PROCESS DOCUMENT ---------------------------\n"
  //   );
  //   console.log("\nDocument:", file.originalname);

  //   // Step 3: Send to AI backend for processing
  //   const formData = new FormData();
  //   formData.append(
  //     "image",
  //     new Blob([new Uint8Array(file.buffer)]),
  //     file.originalname
  //   );

  //   let ai_response, ai_response_data;
  //   try {
  //     ai_response = await fetch(
  //       `${process.env.AI_BACKEND_URL}/process-document`,
  //       {
  //         method: "POST",
  //         body: formData,
  //       }
  //     );

  //     ai_response_data = await ai_response.json();

  //     console.log(
  //       "\nAI response data:",
  //       ai_response_data.status,
  //       ai_response_data?.extracted_data,
  //       ai_response_data?.predicted_class,
  //       `\nError: ${ai_response_data?.error}`
  //     );

  //     if (ai_response_data?.status !== "success") {
  //       console.error("AI backend error:", ai_response_data.error);

  //       // Update session with error - keep status as pending, don't change user stage
  //       savedSession.EPIC1 = {
  //         status: "failed",
  //         message: `AI processing failed: ${ai_response_data.error}`,
  //         data: null,
  //         meta: ai_response_data,
  //       };
  //       await this.KYCSessionRepository.save(savedSession);

  //       // Get fresh user data with updated sessions for accurate count
  //       const updatedUser = await this.getUserById(userId);

  //       return {
  //         status: "failed",
  //         error: ai_response_data.error,
  //         session: {
  //           id: savedSession.id,
  //           status: savedSession.status,
  //           fileURL: savedSession.fileURL,
  //           EPIC1: savedSession.EPIC1,
  //           createdAt: savedSession.createdAt,
  //         },
  //         userUploadCount: updatedUser.uploadedDocuments,
  //       };
  //     }
  //   } catch (error: any) {
  //     console.log("Failed to upload document to AI Backend", error.message);

  //     // Update session with error - keep status as pending
  //     savedSession.EPIC1 = {
  //       status: "failed",
  //       message: `Failed to connect to AI backend: ${error.message}`,
  //       data: null,
  //       meta: null,
  //     };
  //     await this.KYCSessionRepository.save(savedSession);

  //     throw new ApiError(
  //       500,
  //       "Failed to upload document to AI Backend: " + error.message
  //     );
  //   }

  //   // Step 4: Update session with EPIC1 success data
  //   await this.KYCSessionRepository.update(savedSession.id, {
  //     status: "in_progress", // Session continues to next EPIC
  //     documentType: ai_response_data.predicted_class,
  //     EPIC1: {
  //       status: "completed",
  //       message: "Document processed successfully",
  //       data: ai_response_data.extracted_data || {},
  //       meta: {
  //         predicted_class: ai_response_data.predicted_class,
  //         confidence: ai_response_data.confidence,
  //         processing_time: ai_response_data.processing_time,
  //       },
  //     },
  //   });

  //   // Step 5: Update user stage based on progress
  //   await this.updateUserStage(userId);

  //   // Fetch the updated session
  //   const updatedSession = await this.KYCSessionRepository.findOne({
  //     where: { id: savedSession.id },
  //   });

  //   // Get fresh user data with updated sessions for accurate count
  //   const updatedUser = await this.getUserById(userId);

  //   console.log("User upload count:", updatedUser.uploadedDocuments);
  //   console.log(
  //     "\n-----------------------------------------------------------------\n"
  //   );

  //   // Step 6: Return response with session info
  //   return {
  //     ...ai_response_data,
  //     session: {
  //       id: updatedSession!.id,
  //       status: updatedSession!.status,
  //       fileURL: updatedSession!.fileURL,
  //       EPIC1: updatedSession!.EPIC1,
  //       documentType: updatedSession!.documentType,
  //       createdAt: updatedSession!.createdAt,
  //     },
  //     userUploadCount: updatedUser.uploadedDocuments,
  //   };
  // }

  // // EPIC2 - LIVENESS CHECK START
  // async LivenessCheckStart(): Promise<string> {
  //   const params = {
  //     ClientRequestToken: `${Date.now()}-${Math.random()
  //       .toString(36)
  //       .substring(2, 9)}`,
  //     Settings: {
  //       OutputConfig: {
  //         S3Bucket: config.aws.s3BucketName || "d-ai-kyc",
  //         S3KeyPrefix: "liveness-sessions/",
  //       },
  //       AuditImagesLimit: 4,
  //     },
  //   };

  //   try {
  //     const data = await rekognition
  //       .createFaceLivenessSession(params)
  //       .promise();

  //     console.log(
  //       "--------------------------- LIVENESS START ---------------------------\n"
  //     );
  //     console.log("Session Created → [SessionID]", data.SessionId);
  //     console.log(
  //       "\n-----------------------------------------------------------------------\n"
  //     );

  //     return data.SessionId;
  //   } catch (err) {
  //     console.error("Error creating liveness session:", err);
  //     throw new ApiError(500, "Failed to create liveness session");
  //   }
  // }

  // // EPIC2 - LIVENESS CHECK RESULT
  // async LivenessCheckResult(sessionID: string): Promise<any> {
  //   const S3: S3Service = new S3Service();

  //   const data = await rekognition
  //     .getFaceLivenessSessionResults({
  //       SessionId: sessionID,
  //     })
  //     .promise();

  //   console.log(
  //     "--------------------------- LIVENESS RESULT ---------------------------\n"
  //   );

  //   let referenceImageBytes = null;

  //   if (data.ReferenceImage?.S3Object) {
  //     console.log("Fetching image from S3:", data.ReferenceImage.S3Object);
  //     try {
  //       const imageBuffer = await S3.fetchImageFromS3(
  //         data.ReferenceImage.S3Object.Bucket as any,
  //         data.ReferenceImage.S3Object.Name as any
  //       );
  //       referenceImageBytes = imageBuffer.toString("base64");
  //     } catch (s3Error) {
  //       console.error("Failed to fetch image from S3:", s3Error);
  //     }
  //   } else if (data.ReferenceImage?.Bytes) {
  //     referenceImageBytes = Buffer.from(
  //       data.ReferenceImage.Bytes as any
  //     ).toString("base64");
  //   }

  //   const filteredResult = {
  //     SessionId: data.SessionId,
  //     Status: data.Status,
  //     Confidence: data.Confidence,
  //     ReferenceImage: data.ReferenceImage
  //       ? {
  //           BoundingBox: data.ReferenceImage.BoundingBox,
  //           Bytes: referenceImageBytes,
  //         }
  //       : null,
  //   };

  //   console.log("status\t:\t", filteredResult.Status);
  //   console.log("sessionId\t:\t", filteredResult.SessionId);
  //   console.log("confidence\t:\t", filteredResult.Confidence);
  //   console.log(
  //     "\n----------------------------------------------------------------------\n"
  //   );

  //   return filteredResult;
  // }

  // // EPIC2 - FACE VERIFICATION/COMPARISON
  // async compareFaces(
  //   userId: string,
  //   file: Express.Multer.File, // Selfie image for comparison
  //   livenessImageBytes?: string, // Optional: if you have liveness image directly
  //   s3Bucket?: string,
  //   s3Key?: string
  // ): Promise<any> {
  //   const S3: S3Service = new S3Service();

  //   // Step 1: Find the most recent session with completed EPIC1
  //   const session = await this.KYCSessionRepository.findOne({
  //     where: {
  //       userId: userId,
  //       EPIC1: { status: "completed" } as any, // TypeORM JSON query syntax might need adjustment
  //     },
  //     order: { createdAt: "DESC" },
  //   });

  //   if (!session) {
  //     throw new ApiError(
  //       404,
  //       "No completed document found. Please upload and process a document first."
  //     );
  //   }

  //   console.log(
  //     `Using most recent KYC Session: ${session.id} for face comparison`
  //   );

  //   let livenessBuffer: Buffer;

  //   if (livenessImageBytes) {
  //     livenessBuffer = Buffer.from(livenessImageBytes, "base64");
  //     console.log("Using provided liveness image bytes");
  //   } else if (s3Bucket && s3Key) {
  //     try {
  //       livenessBuffer = await S3.fetchImageFromS3(s3Bucket, s3Key);
  //       console.log("Fetched liveness image from S3");
  //     } catch (s3Error) {
  //       console.error("Failed to fetch liveness image from S3:", s3Error);
  //       throw new ApiError(500, "Failed to fetch liveness image from storage");
  //     }
  //   } else {
  //     throw new ApiError(
  //       400,
  //       "No liveness image source provided. Please provide livenessImageBytes or s3 location."
  //     );
  //   }

  //   // Step 2: Initialize EPIC2 as processing
  //   if (!session.EPIC2) {
  //     session.EPIC2 = {
  //       status: "processing",
  //       message: "Face verification started",
  //       data: null,
  //       meta: null,
  //     };
  //     await this.KYCSessionRepository.save(session);
  //   }

  //   // Step 3: Perform face comparison
  //   const params = {
  //     SourceImage: {
  //       Bytes: livenessBuffer, // Liveness/live selfie image
  //     },
  //     TargetImage: {
  //       Bytes: file.buffer, // Document image (ID card photo)
  //     },
  //     SimilarityThreshold: 80,
  //   };

  //   try {
  //     const data = await rekognition.compareFaces(params).promise();

  //     const result = {
  //       isMatch: data.FaceMatches && data.FaceMatches.length > 0,
  //       confidence: data.FaceMatches?.[0]?.Similarity || 0,
  //       faceMatches: data.FaceMatches?.length || 0,
  //       unmatchedFaces: data.UnmatchedFaces?.length || 0,
  //       threshold: 80,
  //     };

  //     // Step 4: Update session with EPIC2 results
  //     if (result.isMatch && result.confidence >= 80) {
  //       // Success case
  //       session.EPIC2 = {
  //         status: "completed",
  //         message: `Face verification successful with ${result.confidence.toFixed(
  //           2
  //         )}% confidence`,
  //         data: {
  //           isMatch: result.isMatch,
  //           confidence: result.confidence,
  //           faceMatches: result.faceMatches,
  //           threshold: result.threshold,
  //         },
  //         meta: {
  //           livenessSessionId: s3Key ? session.id : "direct-upload",
  //           comparisonTimestamp: new Date().toISOString(),
  //         },
  //       };

  //       // Update session status if both EPIC1 and EPIC2 are completed
  //       if (session.EPIC1?.status === "completed") {
  //         session.status = "in_progress"; // Ready for EPIC3
  //       }
  //     } else {
  //       // Failed case - keep status as pending, don't advance stage
  //       session.EPIC2 = {
  //         status: "failed",
  //         message: `Face verification failed with ${result.confidence.toFixed(
  //           2
  //         )}% confidence`,
  //         data: {
  //           isMatch: result.isMatch,
  //           confidence: result.confidence,
  //           faceMatches: result.faceMatches,
  //           threshold: result.threshold,
  //         },
  //         meta: {
  //           livenessSessionId: s3Key ? session.id : "direct-upload",
  //           comparisonTimestamp: new Date().toISOString(),
  //           failureReason: "Low confidence score",
  //         },
  //       };
  //     }

  //     await this.KYCSessionRepository.save(session);

  //     // Step 5: Update user stage if EPIC2 completed successfully
  //     if (session.EPIC2.status === "completed") {
  //       await this.updateUserStage(userId);
  //     }

  //     // Step 6: Get updated user stats
  //     const updatedUser = await this.getUserById(userId);

  //     console.log(
  //       "--------------------------- FACE COMPARISON ---------------------------\n"
  //     );
  //     console.log("KYC Session ID\t:\t", session.id);
  //     console.log("Document Type\t:\t", session.documentType);
  //     console.log("Matched\t:\t", result.isMatch);
  //     console.log("Confidence\t:\t", result.confidence);
  //     console.log("EPIC2 Status\t:\t", session.EPIC2.status);
  //     console.log(
  //       "\n-----------------------------------------------------------------------\n"
  //     );

  //     return {
  //       ...result,
  //       session: {
  //         id: session.id,
  //         status: session.status,
  //         documentType: session.documentType,
  //         fileURL: session.fileURL,
  //         EPIC1: session.EPIC1,
  //         EPIC2: session.EPIC2,
  //         createdAt: session.createdAt,
  //       },
  //       metadata: {
  //         autoSelectedSession: true,
  //         selectedSessionReason: "Most recent completed document",
  //       },
  //     };
  //   } catch (error: any) {
  //     // Handle AWS Rekognition errors
  //     console.error("Face comparison failed:", error);

  //     session.EPIC2 = {
  //       status: "failed",
  //       message: `Face comparison service error: ${error.message}`,
  //       data: null,
  //       meta: {
  //         error: error.message,
  //         errorCode: error.code,
  //         timestamp: new Date().toISOString(),
  //       },
  //     };

  //     await this.KYCSessionRepository.save(session);

  //     throw new ApiError(500, "Face comparison service failed");
  //   }
  // }

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
