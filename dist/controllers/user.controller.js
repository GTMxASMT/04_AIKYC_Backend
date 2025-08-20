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
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = exports.UserController = void 0;
const user_service_1 = require("../services/user.service");
const ApiResponse_1 = require("../utilities/ApiResponse");
const AsyncHandler_1 = require("../utilities/AsyncHandler");
const ApiError_1 = require("../utilities/ApiError");
const httpOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
};
class UserController {
    constructor() {
        this.register = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            const { user, tokens } = yield user_service_1.userService.register(req.body);
            res.cookie("accessToken", tokens.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 15 * 60 * 1000, // 15 minutes
            });
            res.cookie("refreshToken", tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            res
                .status(201)
                .json(new ApiResponse_1.ApiResponse(201, { user, tokens }, "User registered successfully"));
        }));
        // Login user
        this.login = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            const { user, tokens } = yield user_service_1.userService.login(req.body);
            // Set HTTP-only cookies
            res.cookie("accessToken", tokens.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 15 * 60 * 1000, // 15 minutes
            });
            res.cookie("refreshToken", tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, { user, tokens }, "Login successful"));
        }));
        // Refresh token
        this.refreshToken = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            console.log("Refreshing token...", req.body.refreshToken, "-", req.cookies.refreshToken);
            const refreshToken = req.body.refreshToken || req.cookies.refreshToken;
            if (!refreshToken) {
                throw new ApiError_1.ApiError(401, "Refresh token is required");
            }
            const { tokens } = yield user_service_1.userService.refreshToken(refreshToken);
            // Set new HTTP-only cookies
            res.cookie("accessToken", tokens.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 15 * 60 * 1000, // 15 minutes
            });
            res.cookie("refreshToken", tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, { tokens }, "Token refreshed successfully"));
        }));
        // Logout user
        this.logout = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            yield user_service_1.userService.logout(req.user.id);
            // Clear cookies
            res.clearCookie("accessToken");
            res.clearCookie("refreshToken");
            res.status(200).json(new ApiResponse_1.ApiResponse(200, null, "Logout successful"));
        }));
        // Get current user profile
        this.getProfile = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, req.user, "Profile retrieved successfully"));
        }));
        // Get all users (Admin only)
        this.getAllUsers = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const result = yield user_service_1.userService.getAllUsers(page, limit);
            res.status(200).json(new ApiResponse_1.ApiResponse(200, {
                users: result.users,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    totalPages: result.totalPages,
                },
            }, "Users retrieved successfully"));
        }));
        // Get user by ID
        this.getUserById = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            const user = yield user_service_1.userService.getUserById(req.params.id);
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, user, "User retrieved successfully"));
        }));
        // Update user
        this.updateUser = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            const user = yield user_service_1.userService.updateUser(req.params.id, req.body);
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, user, "User updated successfully"));
        }));
        // Delete user
        this.deleteUser = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            yield user_service_1.userService.deleteUser(req.params.id);
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, null, "User deleted successfully"));
        }));
        // Upload profile image
        this.uploadProfileImage = (0, AsyncHandler_1.asyncHandler)((req, res) => __awaiter(this, void 0, void 0, function* () {
            if (!req.file) {
                res.status(400).json(new ApiResponse_1.ApiResponse(400, null, "No file uploaded"));
                return;
            }
            console.log("Uploading profile image:", req.file);
            const user = yield user_service_1.userService.uploadProfileImage(req.user.id, req.file);
            res
                .status(200)
                .json(new ApiResponse_1.ApiResponse(200, user, "Profile image uploaded successfully"));
        }));
    }
}
exports.UserController = UserController;
exports.userController = new UserController();
