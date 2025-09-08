import { Request, Response } from "express";
import { asyncHandler } from "../utilities/AsyncHandler";
import { ApiResponse } from "../utilities/ApiResponse";
import { AIService } from "../services/ai.service";
import { ApiError } from "../utilities/ApiError";
import { StatusCode } from "../config";

const AI: AIService = new AIService();
export class AIController {
  processDocument = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "No file uploaded"));
      return;
    }

    if (!req.user || !req.user?.id) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const result = await AI.processDocument(req.user.id, req.file);

    res
      .status(200)
      .json(new ApiResponse(200, result, "Document processed successfully"));
  });

  //-------------------------------------------------------------------------------

  livenessStart = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const sessionId = await AI.LivenessCheckStart();
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { SessionId: sessionId, status: "success" },
          "Liveness session started"
        )
      );
  });

  //-------------------------------------------------------------------------------

  livenessResult = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }
    const sessionId = req.params.id;
    if (!sessionId) {
      res
        .status(400)
        .json(new ApiResponse(400, null, "Session ID is required"));
      return;
    }

    const result = await AI.LivenessCheckResult(sessionId);

    if (!result) {
      console.log(
        "[controller] Liveness check result not found for session:",
        sessionId
      );
      res
        .status(404)
        .json(new ApiResponse(404, null, "Liveness check result not found"));
      return;
    }

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Liveness check result retrieved successfully"
        )
      );
  });

  //-------------------------------------------------------------------------------

  compareFaces = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "No file uploaded"));
      return;
    }

    if (!req.user) {
      res.status(401).json(new ApiResponse(401, null, "Unauthorized"));
      return;
    }

    const { idPhoto, livenessImageBytes, s3Bucket, s3Key } = req.body;

    const result = await AI.compareFaces(
      req.user.id,
      req.file,
      livenessImageBytes,
      s3Bucket,
      s3Key
    );

    res
      .status(200)
      .json(new ApiResponse(200, result, "Faces compared successfully"));
  });

  //-------------------------------------------------------------------------------

  //-------------------------------------------------------------------------------
  initialize_bot = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      console.log("User not authenticated");
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const initialResponse = await AI.initialize();

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          initialResponse,
          "Chatbot initialized successfully"
        )
      );
  });

  //-------------------------------------------------------------------------------
  chat = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      console.log("User not authenticated");
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const { payload } = req.body;

    if (!payload && !payload.message) {
      console.log("Message is required");
      throw new ApiError(StatusCode.BAD_REQUEST, "Message is required");
    }

    const bot_response = await AI.chat(payload);

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          bot_response,
          "Chatbot response generated successfully"
        )
      );
  });
}
