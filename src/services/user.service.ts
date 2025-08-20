import { Repository } from "typeorm";
import { AppDataSource } from "../database/db";
import { User } from "../entities/User.entity";
import { ApiError } from "../utilities/ApiError";
import { CreateUserDTO, UpdateUserDTO, LoginDTO } from "../DTOs/user.dto";
import { s3Service } from "../middlewares/s3.middleware";
import jwt from "jsonwebtoken";
import { config } from "../config";
import {
  uploadBufferToCloudinary,
  uploadOnCloudinary,
} from "../utilities/cloudinary";
import { rekognition } from "./AWS/rekognition.service";
import { S3Service } from "./AWS/s3.service";
import { Request, Response } from "express";

export class UserService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  private generateTokens(user: User) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret as any, {
      expiresIn: config.jwt.accessExpiresIn as any,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret as any, {
      expiresIn: config.jwt.refreshExpiresIn as any,
    });

    return { accessToken, refreshToken };
  }

  // Register new user
  async register(
    userData: CreateUserDTO
  ): Promise<{ user: User; tokens: any }> {
    const existingUser = await this.userRepository.findOne({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new ApiError(409, "User with this email already exists");
    }

    const user = this.userRepository.create(userData);
    const savedUser = await this.userRepository.save(user);

    const tokens = this.generateTokens(savedUser);

    savedUser.refreshToken = tokens.refreshToken;
    await this.userRepository.save(savedUser);

    return { user: savedUser, tokens };
  }

  // Login user
  async login(loginData: LoginDTO): Promise<{ user: User; tokens: any }> {
    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: loginData.email, isActive: true },
    });

    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    // Check password
    const isPasswordValid = await user.comparePassword(loginData.password);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid email or password");
    }

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Save refresh token to database
    user.refreshToken = tokens.refreshToken;
    await this.userRepository.save(user);

    return { user, tokens };
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<{ tokens: any }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      // Find user with this refresh token
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

      // Generate new tokens
      const tokens = this.generateTokens(user);

      // Update refresh token in database
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

  // Get all users (with pagination)
  async getAllUsers(
    page: number = 1,
    limit: number = 10
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

  // Get user by ID
  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, isActive: true },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return user;
  }

  // Update user
  async updateUser(id: string, updateData: UpdateUserDTO): Promise<User> {
    const user = await this.getUserById(id);

    // Check if email is being updated and if it already exists
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateData.email },
      });

      if (existingUser) {
        throw new ApiError(409, "Email already exists");
      }
    }

    // Update user data
    Object.assign(user, updateData);
    return await this.userRepository.save(user);
  }

  // Delete user (soft delete)
  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);

    // Soft delete by setting isActive to false
    user.isActive = false;
    user.refreshToken = undefined; // Clear refresh token
    await this.userRepository.save(user);
  }

  // Upload profile image
  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File
  ): Promise<User> {
    const user = await this.getUserById(userId);

    // file →  ai/classfication-model  | ngrok
    // post
    // INPUT file
    // OUTPUT confidence,valid , addhar0.4  pan0.4  passport

    // Delete old profile image if exists
    if (user.profileImage) {
      try {
        // await s3Service.deleteFile(user.profileImage);
        console.log("Del img from S3");
      } catch (error) {
        console.error("Failed to delete old profile image:", error);
        // Continue with upload even if delete fails
      }
    }

    console.log("Uploading new profile image:", file);

    const imageUrl: any = await uploadBufferToCloudinary(
      file.buffer,
      file.originalname
    );
    // Upload new image to S3
    // const imageUrl = await s3Service.uploadFile(file, "profile-images");

    // Update user with new image URL
    user.profileImage = imageUrl.secure_url;

    console.log("Uploaded profile image:", imageUrl?.secure_url);
    console.log("User profile image:", user.profileImage);
    // S3 Service
    // user.profileImage = imageUrl;
    return await this.userRepository.save(user);
  }

  // uploading a image to other AI backend running on localhost:8000/classify
  async processDocument(
    userId: string,
    file: Express.Multer.File
  ): Promise<any> {
    const user = await this.getUserById(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    if (!file) {
      throw new ApiError(400, "No file uploaded");
    }

    const formData = new FormData();

    formData.append(
      "image",
      new Blob([new Uint8Array(file.buffer)]),
      file.originalname
    );

    console.log(
      "--------------------------- PROCESS DOCUMENT ---------------------------\n"
    );

    console.log("\nDocument:", file.originalname);
    const ai_response = await fetch(
      `${process.env.AI_BACKEND_URL}/process-document`,
      {
        method: "POST",
        body: formData,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      }
    );

    let ai_response_data = await ai_response.json();

    console.log(
      "\nAI response data : ",
      ai_response_data.status,
      ai_response_data?.extracted_data,
      ai_response_data?.predicted_class,
      ai_response_data?.error
    );

    console.log(
      "\n---------------------------------------------------------\n"
    );

    if (ai_response_data?.status !== "success") {
      console.error("AI backend error:", ai_response_data.error);
      throw new ApiError(
        500,
        "Failed to process document." + ai_response_data.error
      );
    }

    return ai_response_data;
  }

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
        "\n--------------------------- LIVENESS START ---------------------------\n"
      );
      console.log("Session Created →  [SessionID] ", data.SessionId);
      console.log(
        "\n---------------------------------------------------------\n"
      );
      return data.SessionId;
    } catch (err) {
      console.error("Error creating liveness session:", err);
      throw new ApiError(500, "Failed to create liveness session");
    }
  }

  async LivenessCheckResult(sessionID: string): Promise<any> {
    const S3: S3Service = new S3Service();

    const data = await rekognition
      .getFaceLivenessSessionResults({
        SessionId: sessionID,
      })
      .promise();

    console.log(
      "\n--------------------------- LIVENESS RESULT ---------------------------\n"
    );
    let referenceImageBytes = null;

    // if (data?.ReferenceImage?.Bytes) {
    //   if (data?.ReferenceImage.Bytes instanceof Uint8Array) {
    //     // already a Uint8Array
    //     referenceImageBytes = Buffer.from(data.ReferenceImage.Bytes).toString(
    //       "base64"
    //     );
    //   } else if (data.ReferenceImage.Bytes instanceof Blob) {
    //     // convert Blob to ArrayBuffer → Uint8Array → Buffer
    //     const arrayBuffer = await data.ReferenceImage.Bytes.arrayBuffer();
    //     referenceImageBytes = Buffer.from(new Uint8Array(arrayBuffer)).toString(
    //       "base64"
    //     );
    //   } else {
    //     // fallback for string/base64 cases
    //     referenceImageBytes = Buffer.from(
    //       data.ReferenceImage.Bytes as any
    //     ).toString("base64");
    //   }
    // }

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
        // Continue without image bytes
      }
    } else if (data.ReferenceImage?.Bytes) {
      // Direct bytes (if no S3 config)
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
      "\n---------------------------------------------------------\n"
    );
    return filteredResult;
  }

  async compareFaces(
    file: any,
    livenessImageBytes: any,
    s3Bucket: any,
    s3Key: any
  ): Promise<any> {
    const S3: S3Service = new S3Service();

    let livenessBuffer;

    // Handle two cases: direct bytes or S3 object
    if (livenessImageBytes) {
      // Case 1: Direct bytes (when no S3 config)
      livenessBuffer = Buffer.from(livenessImageBytes, "base64");
    } else if (s3Bucket && s3Key) {
      // Case 2: Fetch from S3
      try {
        livenessBuffer = await S3.fetchImageFromS3(s3Bucket, s3Key);
      } catch (s3Error) {
        console.error("Failed to fetch liveness image from S3:", s3Error);
        // return res
        //   .status(500)
        //   .json({ error: "Failed to fetch liveness image from storage" });
      }
    } else {
      console.log("No liveness image data provided");
      // return res
      //   .status(400)
      //   .json({ error: "No liveness image data provided" });
    }

    const params = {
      SourceImage: {
        Bytes: livenessBuffer, // Live capture from liveness session
      },
      TargetImage: {
        Bytes: file.buffer, // Uploaded ID photo
      },
      SimilarityThreshold: 80, // Adjust threshold as needed (70-95)
    };

    const data = await rekognition.compareFaces(params).promise();

    const result = {
      isMatch: data.FaceMatches && data.FaceMatches.length > 0,
      confidence: data.FaceMatches?.[0]?.Similarity || 0,
      faceMatches: data.FaceMatches?.length || 0,
      unmatchedFaces: data.UnmatchedFaces?.length || 0,
      threshold: 80,
    };
    console.log(
      "\n--------------------------- FACE COMPARISON ---------------------------\n"
    );
    console.log("Matched\t:\t", result.isMatch);
    console.log("Confidence\t:\t", result.confidence);
    console.log("Threshold\t:\t", result.threshold);

    console.log(
      "\n---------------------------------------------------------\n"
    );
    return result;
  }
}
