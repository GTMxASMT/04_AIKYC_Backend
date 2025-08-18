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

    // Delete old profile image if exists
    if (user.profileImage) {
      try {
        await s3Service.deleteFile(user.profileImage);
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
}

export const userService = new UserService();
