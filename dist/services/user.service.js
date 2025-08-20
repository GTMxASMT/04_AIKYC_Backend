"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = exports.UserService = void 0;
const db_1 = require("../database/db");
const User_entity_1 = require("../entities/User.entity");
const ApiError_1 = require("../utilities/ApiError");
const s3_middleware_1 = require("../middlewares/s3.middleware");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const cloudinary_1 = require("../utilities/cloudinary");
class UserService {
    constructor() {
        this.userRepository = db_1.AppDataSource.getRepository(User_entity_1.User);
    }
    generateTokens(user) {
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = jsonwebtoken_1.default.sign(payload, config_1.config.jwt.accessSecret, {
            expiresIn: config_1.config.jwt.accessExpiresIn,
        });
        const refreshToken = jsonwebtoken_1.default.sign(payload, config_1.config.jwt.refreshSecret, {
            expiresIn: config_1.config.jwt.refreshExpiresIn,
        });
        return { accessToken, refreshToken };
    }
    // Register new user
    register(userData) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingUser = yield this.userRepository.findOne({
                where: { email: userData.email },
            });
            if (existingUser) {
                throw new ApiError_1.ApiError(409, "User with this email already exists");
            }
            const user = this.userRepository.create(userData);
            const savedUser = yield this.userRepository.save(user);
            const tokens = this.generateTokens(savedUser);
            savedUser.refreshToken = tokens.refreshToken;
            yield this.userRepository.save(savedUser);
            return { user: savedUser, tokens };
        });
    }
    // Login user
    login(loginData) {
        return __awaiter(this, void 0, void 0, function* () {
            // Find user by email
            const user = yield this.userRepository.findOne({
                where: { email: loginData.email, isActive: true },
            });
            if (!user) {
                throw new ApiError_1.ApiError(401, "Invalid email or password");
            }
            // Check password
            const isPasswordValid = yield user.comparePassword(loginData.password);
            if (!isPasswordValid) {
                throw new ApiError_1.ApiError(401, "Invalid email or password");
            }
            // Generate tokens
            const tokens = this.generateTokens(user);
            // Save refresh token to database
            user.refreshToken = tokens.refreshToken;
            yield this.userRepository.save(user);
            return { user, tokens };
        });
    }
    // Refresh access token
    refreshToken(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Verify refresh token
                const decoded = jsonwebtoken_1.default.verify(refreshToken, config_1.config.jwt.refreshSecret);
                // Find user with this refresh token
                const user = yield this.userRepository.findOne({
                    where: {
                        id: decoded.id,
                        refreshToken: refreshToken,
                        isActive: true,
                    },
                });
                if (!user) {
                    throw new ApiError_1.ApiError(401, "Invalid refresh token");
                }
                // Generate new tokens
                const tokens = this.generateTokens(user);
                // Update refresh token in database
                user.refreshToken = tokens.refreshToken;
                yield this.userRepository.save(user);
                return { tokens };
            }
            catch (error) {
                throw new ApiError_1.ApiError(401, "Invalid refresh token");
            }
        });
    }
    // Logout user
    logout(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.userRepository.update(userId, { refreshToken: undefined });
        });
    }
    // Get all users (with pagination)
    getAllUsers() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10) {
            const [users, total] = yield this.userRepository.findAndCount({
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
        });
    }
    // Get user by ID
    getUserById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.userRepository.findOne({
                where: { id, isActive: true },
            });
            if (!user) {
                throw new ApiError_1.ApiError(404, "User not found");
            }
            return user;
        });
    }
    // Update user
    updateUser(id, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUserById(id);
            // Check if email is being updated and if it already exists
            if (updateData.email && updateData.email !== user.email) {
                const existingUser = yield this.userRepository.findOne({
                    where: { email: updateData.email },
                });
                if (existingUser) {
                    throw new ApiError_1.ApiError(409, "Email already exists");
                }
            }
            // Update user data
            Object.assign(user, updateData);
            return yield this.userRepository.save(user);
        });
    }
    // Delete user (soft delete)
    deleteUser(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUserById(id);
            // Soft delete by setting isActive to false
            user.isActive = false;
            user.refreshToken = undefined; // Clear refresh token
            yield this.userRepository.save(user);
        });
    }
    // Upload profile image
    uploadProfileImage(userId, file) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.getUserById(userId);
            // Delete old profile image if exists
            if (user.profileImage) {
                try {
                    yield s3_middleware_1.s3Service.deleteFile(user.profileImage);
                }
                catch (error) {
                    console.error("Failed to delete old profile image:", error);
                    // Continue with upload even if delete fails
                }
            }
            console.log("Uploading new profile image:", file);
            const imageUrl = yield (0, cloudinary_1.uploadBufferToCloudinary)(file.buffer, file.originalname);
            // Upload new image to S3
            // const imageUrl = await s3Service.uploadFile(file, "profile-images");
            // Update user with new image URL
            user.profileImage = imageUrl.secure_url;
            console.log("Uploaded profile image:", imageUrl === null || imageUrl === void 0 ? void 0 : imageUrl.secure_url);
            console.log("User profile image:", user.profileImage);
            // S3 Service
            // user.profileImage = imageUrl;
            return yield this.userRepository.save(user);
        });
    }
}
exports.UserService = UserService;
exports.userService = new UserService();
