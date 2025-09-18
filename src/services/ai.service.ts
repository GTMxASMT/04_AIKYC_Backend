import { Repository } from "typeorm";
import { config, StatusCode, KYCStage, Status } from "../config";
import { ApiError } from "../utilities/ApiError";
import { uploadBufferToCloudinary } from "../utilities/cloudinary";
import { User } from "../entities/User.entity";
import { UserKYCSession } from "../entities/UserKYCSession.entity";
import { AppDataSource } from "../database/db";
import { rekognition } from "./AWS/rekognition.service";
import { S3Service } from "./AWS/s3.service";

export class AIService {
  private userRepository: Repository<User>;
  private KYCSessionRepository: Repository<UserKYCSession>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
    this.KYCSessionRepository = AppDataSource.getRepository(UserKYCSession);
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
  async processDocument(
    userId: string,
    file: Express.Multer.File
  ): Promise<any> {
    // Validation
    if (!userId || typeof userId !== "string") {
      throw new ApiError(400, "Invalid user ID provided");
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: [],
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (!file || !file.buffer) {
      throw new ApiError(400, "No file uploaded");
    }

    // Update user stage to DOCUMENT_UPLOAD when first document is uploaded
    if (user.currentStage === KYCStage.NOT_STARTED) {
      user.updateKYCStage(KYCStage.DOCUMENT_UPLOAD);
      await this.userRepository.save(user);
    }

    // Step 1: Upload file to cloudinary
    let uploadedFileUrl: string;
    try {
      const cloudinaryResult: any = await uploadBufferToCloudinary(
        file.buffer,
        file.originalname
      );
      uploadedFileUrl = cloudinaryResult.secure_url;
      console.log("File uploaded to Cloudinary:", uploadedFileUrl);
    } catch (uploadError) {
      console.error("Failed to upload file:", uploadError);
      throw new ApiError(500, "Failed to upload file to cloud storage");
    }

    // creating new session for each uploaded image
    const session = this.KYCSessionRepository.create({
      userId: userId,
      status: Status.PENDING,
      fileURL: uploadedFileUrl,
      EPIC1: {
        status: Status.PENDING,
        message: "Document processing started",
        data: null,
        meta: null,
      },
    });

    const savedSession = await this.KYCSessionRepository.save(session);

    // Update stage to DOCUMENT_PROCESSING
    if (user.currentStage === KYCStage.DOCUMENT_UPLOAD) {
      await this.userRepository.update(
        { id: user.id },
        { currentStage: KYCStage.DOCUMENT_PROCESSING }
      );
      user.currentStage = KYCStage.DOCUMENT_PROCESSING;
    }

    console.log(
      "---------------------------------------- PROCESS DOCUMENT ----------------------------------------------\n"
    );

    // Step 3: Send to AI backend for processing
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([new Uint8Array(file.buffer)]),
      file.originalname
    );

    let ai_response, ai_response_data;
    console.log(process.env.AI_BACKEND_URL+ "/kyc/process-document")
    try {
      ai_response = await fetch(
        `${process.env.AI_BACKEND_URL}/kyc/process-document`,
        {
          method: "POST",
          body: formData,
        }
      );

      ai_response_data = await ai_response.json();

      console.log(
        "\nAI extracted data:",
        // ai_response_data.status,
        ai_response_data?.extracted_data,
        ai_response_data?.predicted_class,
        `\nError → ${ai_response_data?.error}`
      );

      if (ai_response_data?.status !== "success") {
        console.error("AI backend error:", ai_response_data?.error);

        // Update session with error - keep status as pending, don't change user stage
        savedSession.EPIC1 = {
          status: Status.FAILED,
          message: `AI processing failed: ${ai_response_data.error}`,
          data: null,
          meta: ai_response_data,
        };
        await this.KYCSessionRepository.save(savedSession);

        // Get fresh user data with updated sessions for accurate count
        const updatedUser = await this.getUserById(userId);

        return {
          status: "failed",
          error: ai_response_data.error,
          session: {
            id: savedSession.id,
            status: savedSession.status,
            fileURL: savedSession.fileURL,
            EPIC1: savedSession.EPIC1,
            createdAt: savedSession.createdAt,
          },
          userUploadCount: updatedUser.uploadedDocuments,
        };
      }
    } catch (error: any) {
      console.log("Failed to upload document to AI Backend", error.message);

      // Update session with error - keep status as pending
      savedSession.EPIC1 = {
        status: Status.FAILED,
        message: `Failed to connect to AI backend: ${error.message}`,
        data: null,
        meta: null,
      };
      await this.KYCSessionRepository.save(savedSession);

      throw new ApiError(
        500,
        "Failed to upload document to AI Backend: " + error.message
      );
    }
    // Step 4: Update session with EPIC1 success data
    await this.KYCSessionRepository.update(savedSession.id, {
      status: Status.PENDING, // Session continues to next EPIC
      documentType: ai_response_data.predicted_class,
      EPIC1: {
        status: Status.COMPLETED,
        message: "Document processed successfully",
        data: {
          extracted_data: ai_response_data?.extracted_data,
          predicted_class: ai_response_data?.predicted_class,
        },
        meta: {
          confidence: ai_response_data?.confidence,
          processing_time: ai_response_data?.processing_time,
        },
      },
    });

    // Step 5: Update user stage based on progress
    await this.updateUserStage(userId);

    // Fetch the updated session
    const updatedSession = await this.KYCSessionRepository.findOne({
      where: { id: savedSession.id },
    });

    console.log("***KYC Session ID\t:\t", updatedSession!.id);
    const updatedUser = await this.getUserById(userId);

    console.log("User upload count:", updatedUser.uploadedDocuments);
    console.log(
      "\n----------------------------------------------------------------------------------------------\n"
    );

    return {
      ...ai_response_data,
      session: {
        id: updatedSession!.id,
        status: updatedSession!.status,
        fileURL: updatedSession!.fileURL,
        EPIC1: updatedSession!.EPIC1,
        documentType: updatedSession!.documentType,
        createdAt: updatedSession!.createdAt,
      },
      userUploadCount: updatedUser.uploadedDocuments,
    };
  }

  // EPIC2 - LIVENESS CHECK START
  async LivenessCheckStart(): Promise<string> {
    const params = {
      ClientRequestToken: `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)}`,
      Settings: {
        OutputConfig: {
          S3Bucket: config.aws.s3BucketName || "d-ai-kyc",
          S3KeyPrefix: "liveness-sessions/",
        },
        AuditImagesLimit: 4,
      },
    };

    try {
      const data = await rekognition
        .createFaceLivenessSession(params)
        .promise();

      console.log(
        "------------------------------------------- LIVENESS START -----------------------------------------------\n"
      );
      console.log("Session Created → [SessionID]", data.SessionId);
      console.log(
        "\n--------------------------------------------------------------------------------------------------------\n"
      );

      return data.SessionId;
    } catch (err) {
      console.error("Error creating liveness session:", err);
      throw new ApiError(500, "Failed to create liveness session");
    }
  }

  // EPIC2 - LIVENESS CHECK RESULT
  async LivenessCheckResult(sessionID: string): Promise<any> {
    const S3: S3Service = new S3Service();

    const data = await rekognition
      .getFaceLivenessSessionResults({
        SessionId: sessionID,
      })
      .promise();

      console.log(
        "--------------------------------------------- LIVENESS RESULT -----------------------------------------------\n"
      );
    console.log("Raw Liveness Data - \n", data, "\n\n");

    // console.log("\nrekognition data - ", data);

    let referenceImageBytes = null;

    if (data.ReferenceImage?.S3Object) {
      console.log("Fetching image from S3:", data.ReferenceImage.S3Object);
      try {
        const imageBuffer = await S3.fetchImageFromS3(
          data.ReferenceImage.S3Object.Bucket as any,
          data.ReferenceImage.S3Object.Name as any
        );
        referenceImageBytes = imageBuffer.toString("base64");
      } catch (s3Error) {
        console.error("Failed to fetch image from S3:", s3Error);
      }
    } else if (data.ReferenceImage?.Bytes) {
      referenceImageBytes = Buffer.from(
        data.ReferenceImage.Bytes as any
      ).toString("base64");
    }

    const filteredResult = {
      SessionId: data.SessionId,
      Status: data.Status,
      Confidence: data.Confidence,
      ReferenceImage: data.ReferenceImage
        ? {
            BoundingBox: data.ReferenceImage.BoundingBox,
            Bytes: referenceImageBytes,
          }
        : null,
    };

    console.log("status\t:\t", filteredResult.Status);
    console.log("sessionId\t:\t", filteredResult.SessionId);
    console.log("confidence\t:\t", filteredResult.Confidence);
    console.log(
      "\n----------------------------------------------------------------------\n"
    );

    return filteredResult;
  }

  // EPIC2 - FACE VERIFICATION/COMPARISON
    async compareFaces(
      userId: string,
      file: Express.Multer.File, // Selfie image for comparison
      livenessImageBytes?: string, // Optional: if you have liveness image directly
      s3Bucket?: string,
      s3Key?: string
    ): Promise<any> {
    console.log(
      "--------------------------- FACE COMPARISON ---------------------------\n"
    );
    const S3: S3Service = new S3Service();

    // Step 1: Find the most recent session with completed EPIC1
    const session = await this.KYCSessionRepository.findOne({
      where: {
        userId: userId,
        // Note: TypeORM JSON queries can be tricky, you might need to adjust this
      },
      order: { createdAt: "DESC" },
    });

    if (!session || !session.EPIC1 || session.EPIC1.status !== "completed") {
      throw new ApiError(
        404,
        "No completed document found. Please upload and process a document first."
      );
    }

    console.log(`Using most recent KYC Session: ${session.id} for face comparison`);

    let livenessBuffer: Buffer;

    if (livenessImageBytes) {
      livenessBuffer = Buffer.from(livenessImageBytes, "base64");
      console.log("Using provided liveness image bytes");
    } else if (s3Bucket && s3Key) {
      try {
        livenessBuffer = await S3.fetchImageFromS3(s3Bucket, s3Key);
        console.log("Fetched liveness image from S3");
      } catch (s3Error) {
        console.error("Failed to fetch liveness image from S3:", s3Error);
        throw new ApiError(500, "Failed to fetch liveness image from storage");
      }
    } else {
      throw new ApiError(
        400,
        "No liveness image source provided. Please provide livenessImageBytes or s3 location."
      );
    }

    console.log("\n----------------------LIVENESS BUFFER---------------\n", livenessBuffer,"\n--------------------------------------\n");

    // Step ")
    // Step 2: Initialize EPIC2 as processing
    if (!session.EPIC2) {
      session.EPIC2 = {
        status: Status.PENDING,
        message: "Face verification started",
        data: null,
        meta: null,
      };
      await this.KYCSessionRepository.save(session);
    }

    // Step 3: Perform face comparison
    const params = {
      SourceImage: {
        Bytes: livenessBuffer, // Liveness/live selfie image
      },
      TargetImage: {
        Bytes: file.buffer, // Document image (ID card photo)
      },
      SimilarityThreshold: 80,
    };

    try {
      const data = await rekognition.compareFaces(params).promise();

      // console.log("compare face data - ", data);

      const result = {
        isMatch: data.FaceMatches && data.FaceMatches.length > 0,
        confidence: data.FaceMatches?.[0]?.Similarity || 0,
        faceMatches: data.FaceMatches?.length || 0,
        unmatchedFaces: data.UnmatchedFaces?.length || 0,
        threshold: 80,
      };

      // Step 4: Update session with EPIC2 results
      if (result.isMatch && result.confidence >= 80) {
        // Success case
        session.EPIC2 = {
          status: Status.COMPLETED,
          message: `Face verification successful with ${result.confidence.toFixed(
            2
          )}% confidence`,
          data: {
            isMatch: result.isMatch,
            confidence: result.confidence,
            faceMatches: result.faceMatches,
            threshold: result.threshold,
          },
          meta: {
            livenessSessionId: s3Key ? session.id : "direct-upload",
            comparisonTimestamp: new Date().toISOString(),
          },
        };

        // Update session status if both EPIC1 and EPIC2 are completed
        if (session.EPIC1?.status === "completed") {
          session.status = Status.PENDING; // Ready for EPIC3
        }
      } else {
        // Failed case - keep status as pending, don't advance stage
        session.EPIC2 = {
          status: Status.FAILED,
          message: `Face verification failed with ${result.confidence.toFixed(
            2
          )}% confidence`,
          data: {
            isMatch: result.isMatch,
            confidence: result.confidence,
            faceMatches: result.faceMatches,
            threshold: result.threshold,
          },
          meta: {
            livenessSessionId: s3Key ? session.id : "direct-upload",
            comparisonTimestamp: new Date().toISOString(),
            failureReason: "Low confidence score",
          },
        };
      }

      await this.KYCSessionRepository.save(session);

      // Step 5: Update user stage if EPIC2 completed successfully
      if (session.EPIC2.status === Status.COMPLETED) {
        await this.updateUserStage(userId);
      }

      // Step 6: Get updated user stats
      const updatedUser = await this.getUserById(userId);

      console.log("KYC Session ID\t:\t", session.id);
      console.log("Document Type\t:\t", session.documentType);
      console.log("Matched\t:\t", result.isMatch);
      console.log("Confidence\t:\t", result.confidence);
      console.log("EPIC2 Status\t:\t", session.EPIC2.status);
      console.log(
        "\n-----------------------------------------------------------------------\n"
      );

      return {
        ...result,
        session: {
          id: session.id,
          status: session.status,
          documentType: session.documentType,
          fileURL: session.fileURL,
          EPIC1: session.EPIC1,
          EPIC2: session.EPIC2,
          createdAt: session.createdAt,
        },
        metadata: {
          autoSelectedSession: true,
          selectedSessionReason: "Most recent completed document",
        },
      };
    } catch (error: any) {
      // Handle AWS Rekognition errors
      console.error("Face comparison failed:", error);

      session.EPIC2 = {
        status: Status.FAILED,
        message: `Face comparison service error: ${error.message}`,
        data: null,
        meta: {
          error: error.message,
          errorCode: error.code,
          timestamp: new Date().toISOString(),
        },
      };

      await this.KYCSessionRepository.save(session);

      throw new ApiError(500, "Face comparison service failed");
    }
  }

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

  // Chatbot initialization
  async initialize(): Promise<any> {
    let data;
    try {
      const res = await fetch(
        `${process.env.AI_BACKEND_URL}/chatbot/initialize`,
        {
          method: "POST",
        }
      );
      data = await res.json();
      console.log("Chatbot initialized! Data → ", data);
    } catch (e: any) {
      console.log("Failed to initialize chatbot");
      throw new ApiError(StatusCode.INTERNAL_SERVER_ERROR, e.message);
    }

    return data;
  }

  // Chatbot conversation
  async chat(payload: any): Promise<any> {
    let data;
    const { message } = payload;
    console.log("Payload - ", payload);
    try {
      const res = await fetch(`${process.env.AI_BACKEND_URL}/chatbot/chat`, {
        method: "POST",
        body: JSON.stringify({
          message,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      data = await res.json();
      console.log("Chatbot response - ", data);
    } catch (e: any) {
      console.log("Failed to chat", e.message);
      throw new ApiError(StatusCode.INTERNAL_SERVER_ERROR, e.message);
    }

    return data;
  }
}
