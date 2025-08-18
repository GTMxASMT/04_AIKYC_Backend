import { Request, Response } from "express";
import { userService } from "../services/user.service";
import { ApiResponse } from "../utilities/ApiResponse";
import { asyncHandler } from "../utilities/AsyncHandler";
import { ApiError } from "../utilities/ApiError";

const httpOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export class UserController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const { user, tokens } = await userService.register(req.body);

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
      .json(
        new ApiResponse(201, { user, tokens }, "User registered successfully")
      );
  });

  // Login user
  login = asyncHandler(async (req: Request, res: Response) => {
    const { user, tokens } = await userService.login(req.body);

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
      .json(new ApiResponse(200, { user, tokens }, "Login successful"));
  });

  // Refresh token
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    console.log(
      "Refreshing token...",
      req.body.refreshToken,
      "-",
      req.cookies.refreshToken
    );

    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;
    if (!refreshToken) {
      throw new ApiError(401, "Refresh token is required");
    }
    const { tokens } = await userService.refreshToken(refreshToken);

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
      .json(new ApiResponse(200, { tokens }, "Token refreshed successfully"));
  });

  // Logout user
  logout = asyncHandler(async (req: Request, res: Response) => {
    await userService.logout(req.user!.id);

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.status(200).json(new ApiResponse(200, null, "Logout successful"));
  });

  // Get current user profile
  getProfile = asyncHandler(async (req: Request, res: Response) => {
    res
      .status(200)
      .json(new ApiResponse(200, req.user, "Profile retrieved successfully"));
  });

  // Get all users (Admin only)
  getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await userService.getAllUsers(page, limit);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          users: result.users,
          pagination: {
            page,
            limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
        "Users retrieved successfully"
      )
    );
  });

  // Get user by ID
  getUserById = asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getUserById(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, user, "User retrieved successfully"));
  });

  // Update user
  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.updateUser(req.params.id, req.body);

    res
      .status(200)
      .json(new ApiResponse(200, user, "User updated successfully"));
  });

  // Delete user
  deleteUser = asyncHandler(async (req: Request, res: Response) => {
    await userService.deleteUser(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, null, "User deleted successfully"));
  });

  // Upload profile image
  uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "No file uploaded"));
      return;
    }

    console.log("Uploading profile image:", req.file);

    const user = await userService.uploadProfileImage(req.user!.id, req.file);

    res
      .status(200)
      .json(new ApiResponse(200, user, "Profile image uploaded successfully"));
  });
}

export const userController = new UserController();
