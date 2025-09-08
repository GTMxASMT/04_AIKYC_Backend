// XWebrtc.controller.ts
import { Request, Response } from "express";
import { XWebRTCService } from "../services/Xwebrtc.service";
import { ApiResponse } from "../utilities/ApiResponse";
import { ApiError } from "../utilities/ApiError";
import { asyncHandler } from "../utilities/AsyncHandler";
import { StatusCode, UserRole } from "../config";

export class XWebRTCController {
  private webrtcService: XWebRTCService;

  constructor() {
    this.webrtcService = new XWebRTCService();
  }

  getVideoKYCUsers = asyncHandler(async (req: Request, res: Response) => {
    const users = await this.webrtcService.getVideoKYCUsers();

    return res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          users,
          "Video KYC users retrieved successfully"
        )
      );
  });

  selectVideoKYCUser = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      throw new ApiError(400, "User ID is required");
    }

    const result = await this.webrtcService.selectVideoKYCUser(userId);

    return res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          result,
          "Video KYC user selected successfully"
        )
      );
  });

  // Send email to user with instructions

  // Only AGENT or ADMIN can create sessions
  createSession = asyncHandler(async (req: Request, res: Response) => {
    const { targetUserId, sessionId, metadata } = req.body;
    const agentId = req.user?.id;
    const agentRole = req.user?.role;

    console.log("Metadata received:", metadata);
    if (!agentId) {
      throw new ApiError(401, "Unauthorized - Agent authentication required");
    }

    // Only agents or admins can create sessions
    if (agentRole !== UserRole.AGENT && agentRole !== UserRole.ADMIN) {
      throw new ApiError(403, "Only agents or admins can create sessions");
    }

    if (!targetUserId) {
      throw new ApiError(400, "Target user ID is required for KYC session");
    }

    const sessionData = await this.webrtcService.createSession(
      agentId,
      targetUserId,
      sessionId
    );
    console.log("[controller] Session created:", sessionData);

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          sessionData,
          "Session created and agent joined successfully"
        )
      );
  });

  getSession = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const session = await this.webrtcService.getSession(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    // Include KYC details if available
    const kycDetails = await this.webrtcService.getKYCSessionDetails(sessionId);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...session,
          kycDetails,
        },
        "Session retrieved successfully"
      )
    );
  });

  // Users join existing sessions
  joinSession = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, metadata } = req.params;
    const user = req.user!;

    console.log("Metadata on join:", metadata);

    // Validate user role
    if (![UserRole.USER, UserRole.AGENT, UserRole.ADMIN].includes(user.role)) {
      throw new ApiError(403, "Invalid user role for session");
    }

    const result = await this.webrtcService.joinSession(sessionId, {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Joined session successfully"));
  });

  leaveSession = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const result = await this.webrtcService.leaveSession(sessionId, userId);

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Left session successfully"));
  });

  submitVerification = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { checklist, status, notes, ipAddress, geoLocation, time } = req.body;
    const agentId = req.user?.id;
    const agentRole = req.user?.role;

    if (!agentId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Only agents or admins can submit verification
    if (agentRole !== UserRole.AGENT && agentRole !== UserRole.ADMIN) {
      throw new ApiError(403, "Only agents or admins can submit verification");
    }

    if (!checklist || status === undefined) {
      throw new ApiError(400, "Checklist and status are required");
    }

    // Validate checklist structure
    if (!Array.isArray(checklist)) {
      throw new ApiError(400, "Checklist must be an array");
    }

    for (const item of checklist) {
      if (!item.id || !item.item || typeof item.status !== "boolean") {
        throw new ApiError(400, "Invalid checklist item structure");
      }
    }

    // Validate status
    if (!["approved", "rejected", "pending"].includes(status)) {
      throw new ApiError(
        400,
        "Status must be 'approved', 'rejected', or 'pending'"
      );
    }

    console.log({ checklist, status, notes, ipAddress, geoLocation, time });
    const result = await this.webrtcService.submitVerification(
      sessionId,
      agentId,
      { checklist, status, notes, ipAddress, geoLocation, time }
    );

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Verification submitted successfully")
      );
  });

  getParticipants = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const participants = await this.webrtcService.getSessionParticipants(
      sessionId
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          participants,
          "Participants retrieved successfully"
        )
      );
  });

  startRecording = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const agentId = req.user?.id;
    const agentRole = req.user?.role;

    if (!agentId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Only agents or admins can control recording
    if (agentRole !== UserRole.AGENT && agentRole !== UserRole.ADMIN) {
      throw new ApiError(403, "Only agents or admins can control recording");
    }

    const result = await this.webrtcService.startRecording(sessionId, agentId);

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Recording started successfully"));
  });

  stopRecording = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const agentId = req.user?.id;
    const agentRole = req.user?.role;

    if (!agentId) {
      throw new ApiError(401, "Unauthorized");
    }

    // Only agents or admins can control recording
    if (agentRole !== UserRole.AGENT && agentRole !== UserRole.ADMIN) {
      throw new ApiError(403, "Only agents or admins can control recording");
    }

    const result = await this.webrtcService.stopRecording(sessionId, agentId);

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Recording stopped successfully"));
  });

  getHealth = asyncHandler(async (req: Request, res: Response) => {
    const health = await this.webrtcService.getHealthStatus();

    return res
      .status(200)
      .json(new ApiResponse(200, health, "WebRTC service is healthy"));
  });

  getStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await this.webrtcService.getStats();

    return res
      .status(200)
      .json(new ApiResponse(200, stats, "Stats retrieved successfully"));
  });

  getKYCDetails = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const kycDetails = await this.webrtcService.getKYCSessionDetails(sessionId);

    if (!kycDetails) {
      throw new ApiError(
        404,
        "No KYC session associated with this video session"
      );
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, kycDetails, "KYC details retrieved successfully")
      );
  });
}
