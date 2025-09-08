import { Request, Response } from "express";
import { StatusCode } from "../config";
import { ApiError } from "../utilities/ApiError";
import { ApiResponse } from "../utilities/ApiResponse";
import { asyncHandler } from "../utilities/AsyncHandler";
import { ChatService } from "../services/chat.service";

export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
  }

  initialize = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const chat = await this.chatService.initializeChat();

    console.log("chat - ", chat);

    res
      .status(StatusCode.SUCCESS)
      .json(new ApiResponse(StatusCode.SUCCESS, chat, "Chat initialized"));
  });

  // ============ CORE CHAT METHODS ============

  sendMessage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const { message } = req.body;

    if (!message?.trim()) {
      throw new ApiError(StatusCode.BAD_REQUEST, "Message is required");
    }

    const result = await this.chatService.sendMessage(
      req?.user?.id,
      message.trim()
    );

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(StatusCode.SUCCESS, result, "Message sent successfully")
      );
  });

  getChatHistory = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const messages = await this.chatService.getChatHistory(req.user.id, limit);

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          { messages, totalMessages: messages.length },
          "Chat history retrieved successfully"
        )
      );
  });

  // ✅ NEW: Get all user chat history across all chats
  getAllUserChatHistory = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const chatHistory = await this.chatService.getAllUserChatHistory(
      req.user.id,
      limit
    );

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          chatHistory,
          "Complete chat history retrieved successfully"
        )
      );
  });

  // ============ USER PROGRESS METHODS ============

  getUserProgress = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const progress = await this.chatService.getUserProgress(req.user.id);

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          progress,
          "User progress retrieved successfully"
        )
      );
  });

  getStageInfo = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const stageInfo = await this.chatService.getStageInfo(req.user.id);

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          stageInfo,
          "Stage information retrieved successfully"
        )
      );
  });

  // ============ ADMIN METHODS ============

  getChatAnalytics = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    // If userId is provided in params, use it; otherwise use current user's ID
    const targetUserId = req.params.userId || req.user.id;

    // Check if admin or same user
    if (req.user.role !== "admin" && targetUserId !== req.user.id) {
      throw new ApiError(StatusCode.FORBIDDEN, "Access denied");
    }

    const analytics = await this.chatService.getChatAnalytics(targetUserId);

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          analytics,
          "Chat analytics retrieved successfully"
        )
      );
  });

  // ✅ NEW: Cleanup empty chats (utility endpoint)
  cleanupEmptyChats = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new ApiError(StatusCode.UNAUTHORIZED, "User not authenticated");
    }

    const deletedCount = await this.chatService.cleanupEmptyChats(req.user.id);

    res
      .status(StatusCode.SUCCESS)
      .json(
        new ApiResponse(
          StatusCode.SUCCESS,
          { deletedChats: deletedCount },
          `Successfully cleaned up ${deletedCount} empty chats`
        )
      );
  });
}
