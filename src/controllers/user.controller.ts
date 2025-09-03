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

  // getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  //   const page = parseInt(req.query.page as string) || 1;
  //   const limit = parseInt(req.query.limit as string) || 10;

  //   const result = await userService.getAllUsers(page, limit);

  //   res.status(200).json(
  //     new ApiResponse(
  //       200,
  //       {
  //         users: result.users,
  //         pagination: {
  //           page,
  //           limit,
  //           total: result.total,
  //           totalPages: result.totalPages,
  //         },
  //       },
  //       "Users retrieved successfully"
  //     )
  //   );
  // });

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

  // // ================================ EPIC1 - DOCUMENT PROCESSING ================================
  // processDocument = asyncHandler(async (req: Request, res: Response) => {
  //   if (!req.file) {
  //     res.status(400).json(new ApiResponse(400, null, "No file uploaded"));
  //     return;
  //   }

  //   if (!req.user) {
  //     res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
  //     return;
  //   }

  //   const result = await userService.processDocument(req.user.id, req.file);

  //   res
  //     .status(200)
  //     .json(new ApiResponse(200, result, "Document processed successfully"));
  // });

  // // ================================ EPIC2 - LIVENESS & FACE VERIFICATION ================================
  // livenessStart = asyncHandler(async (req: Request, res: Response) => {
  //   if (!req.user) {
  //     res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
  //     return;
  //   }

  //   const sessionId = await userService.LivenessCheckStart();
  //   res
  //     .status(200)
  //     .json(
  //       new ApiResponse(
  //         200,
  //         { SessionId: sessionId, status: "success" },
  //         "Liveness session started"
  //       )
  //     );
  // });

  // livenessResult = asyncHandler(async (req: Request, res: Response) => {
  //   if (!req.user) {
  //     res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
  //     return;
  //   }
  //   const sessionId = req.params.id;
  //   if (!sessionId) {
  //     res
  //       .status(400)
  //       .json(new ApiResponse(400, null, "Session ID is required"));
  //     return;
  //   }

  //   const result = await userService.LivenessCheckResult(sessionId);

  //   if (!result) {
  //     console.log(
  //       "[controller] Liveness check result not found for session:",
  //       sessionId
  //     );
  //     res
  //       .status(404)
  //       .json(new ApiResponse(404, null, "Liveness check result not found"));
  //     return;
  //   }

  //   res
  //     .status(200)
  //     .json(
  //       new ApiResponse(
  //         200,
  //         result,
  //         "Liveness check result retrieved successfully"
  //       )
  //     );
  // });

  // compareFaces = asyncHandler(async (req: Request, res: Response) => {
  //   if (!req.file) {
  //     res.status(400).json(new ApiResponse(400, null, "No file uploaded"));
  //     return;
  //   }

  //   if (!req.user) {
  //     res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
  //     return;
  //   }

  //   const { livenessImageBytes, s3Bucket, s3Key } = req.body;

  //   const result = await userService.compareFaces(
  //     req.user.id,
  //     req.file,
  //     livenessImageBytes,
  //     s3Bucket,
  //     s3Key
  //   );

  //   res
  //     .status(200)
  //     .json(new ApiResponse(200, result, "Faces compared successfully"));
  // });

  // ================================ EPIC3 - VIDEO KYC ================================
  startVideoKYC = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const { sessionId, agentData } = req.body;

    const result = await userService.videoKYC(
      req.user.id,
      sessionId,
      agentData
    );

    res
      .status(200)
      .json(
        new ApiResponse(200, result, "Video KYC session started successfully")
      );
  });

  completeVideoKYC = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const { sessionId } = req.params;
    const verificationData = req.body;

    // Validate required fields
    const requiredFields = [
      "agentVerification",
      "documentReview",
      "faceComparison",
      "addressVerification",
      "signatureVerification",
    ];

    for (const field of requiredFields) {
      if (typeof verificationData[field] !== "boolean") {
        res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              `${field} is required and must be a boolean`
            )
          );
        return;
      }
    }

    const result = await userService.completeVideoKYC(
      req.user.id,
      sessionId,
      verificationData
    );

    res
      .status(200)
      .json(new ApiResponse(200, result, "Video KYC completed successfully"));
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
