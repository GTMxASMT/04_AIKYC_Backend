import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { ApiResponse } from "../utilities/ApiResponse";
import { asyncHandler } from "../utilities/AsyncHandler";
import { ApiError } from "../utilities/ApiError";
import { UserRole } from "../config";

const accessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 24 * 60 * 60 * 1000,
});

const refreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days - match JWT expiry
});

const userService = new UserService();

export class UserController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const { gtm, gretoken } = req.body;

    if (!gtm && !gretoken) {
      console.log("[Controller] no gretoken in body");
    }

    const { user, tokens } = await userService.register(req.body, gretoken);

    res.cookie("accessToken", tokens.accessToken, accessTokenCookieOptions());
    res.cookie(
      "refreshToken",
      tokens.refreshToken,
      refreshTokenCookieOptions()
    );

    console.log("Register successfull");
    res
      .status(201)
      .json(
        new ApiResponse(201, { user, tokens }, "User registered successfully")
      );
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { gtm, gretoken } = req.body;

    if (!gtm && !gretoken) {
      console.log("[Controller] no gretoken in body");
    }
    const { user, tokens } = await userService.login(req.body, gretoken);

    res.cookie("accessToken", tokens.accessToken, accessTokenCookieOptions());
    res.cookie(
      "refreshToken",
      tokens.refreshToken,
      refreshTokenCookieOptions()
    );

    console.log("Login successfull");

    res
      .status(200)
      .json(new ApiResponse(200, { user, tokens }, "Login successful"));
  });

  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    console.log("Refresh token request:", {
      bodyToken: req.body.refreshToken ? "present" : "missing",
      cookieToken: req.cookies.refreshToken ? "present" : "missing",
      bodyKeys: Object.keys(req.body),
      cookies: Object.keys(req.cookies || {}),
    });

    let refreshToken =
      req.body.refreshToken ||
      req.body.refresh_token ||
      req.cookies.refreshToken;

    if (!refreshToken) {
      throw new ApiError(401, "Refresh token is required");
    }

    try {
      const { tokens } = await userService.refreshToken(refreshToken);

      res.cookie("accessToken", tokens.accessToken, accessTokenCookieOptions());
      res.cookie(
        "refreshToken",
        tokens.refreshToken,
        refreshTokenCookieOptions()
      );

      res
        .status(200)
        .json(new ApiResponse(200, { tokens }, "Token refreshed successfully"));
    } catch (error) {
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      throw error;
    }
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.id) {
      await userService.logout(req.user.id);
    }

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.status(200).json(new ApiResponse(200, null, "Logout successful"));
  });

  getProfile = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }
    const user = await userService.getUserById(req.user.id);
    res
      .status(200)
      .json(new ApiResponse(200, user, "Profile retrieved successfully"));
  });

  getUserById = asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getUserById(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, user, "User retrieved successfully"));
  });

  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.updateUser(req.params.id, req.body);

    res
      .status(200)
      .json(new ApiResponse(200, user, "User updated successfully"));
  });

  deleteUser = asyncHandler(async (req: Request, res: Response) => {
    await userService.deleteUser(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, null, "User deleted successfully"));
  });

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

  forgetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const resetToken = await userService.forgetPassword(email);

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { resetToken },
          "Password reset token generated. Check your email."
        )
      );
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw new ApiError(400, "Token and new password are required");
    }

    await userService.resetPassword(token, newPassword);

    res
      .status(200)
      .json(new ApiResponse(200, null, "Password reset successfully"));
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "Current and new passwords are required");
    }

    await userService.changePassword(req.user.id, currentPassword, newPassword);

    res
      .status(200)
      .json(new ApiResponse(200, null, "Password changed successfully"));
  });

  // ================================ KYC SESSION MANAGEMENT ================================
  getKYCSession = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const { sessionId } = req.params;

    const session = await userService.getKYCSessionDetails(
      sessionId,
      req.user.id
    );

    res
      .status(200)
      .json(
        new ApiResponse(200, session, "KYC session retrieved successfully")
      );
  });

  getUserKYCSessions = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const sessions = await userService.getUserKYCSessions(req.user.id);

    res
      .status(200)
      .json(
        new ApiResponse(200, sessions, "KYC sessions retrieved successfully")
      );
  });

  getKYCStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const status = await userService.getUserKYCStatus(req.user.id);

    res
      .status(200)
      .json(new ApiResponse(200, status, "KYC status retrieved successfully"));
  });
}

export const userController = new UserController();
