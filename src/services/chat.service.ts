import { Repository } from "typeorm";
import { User } from "../entities/User.entity";
import { UserChat } from "../entities/UserChat.entity";
import { AppDataSource } from "../database/db";
import { ApiError } from "../utilities/ApiError";
import { KYCStage, StatusCode } from "../config";

export class ChatService {
  private userRepository: Repository<User>;
  private chatRepository: Repository<UserChat>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
    this.chatRepository = AppDataSource.getRepository(UserChat);
  }

  async initializeChat(): Promise<any> {
    let data;
    try {
      const res = await fetch(
        `${process.env.AI_BACKEND_URL}/chatbot/initialize`,
        {
          method: "GET",
        }
      );
      data = await res.json();
      console.log("Chatbot initialized! Data → ", data);
    } catch (e: any) {
      console.log("Failed to initialize chatbot");
      throw new ApiError(StatusCode.INTERNAL_SERVER_ERROR, e.message);
    }

    return data;
  }

  // ============ CORE CHAT METHODS ============

  async sendMessage(userId: string, query: string): Promise<any> {
    // Get user with relations - Order chats by updatedAt DESC to get the most recent first
    console.log("Query → ", query);

    if (!userId) {
      console.log("User is required");
      throw new ApiError(StatusCode.BAD_REQUEST, "User is required");
    }
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: ["chats", "KYCSessions"],
      order: {
        chats: {
          updatedAt: "DESC",
        },
      },
    });

    if (!user) {
      throw new ApiError(StatusCode.NOT_FOUND, "User not found");
    }

    // Get or create user's chat (get most recent one or create new)
    let chat = user.chats?.[0]; // Most recent chat due to ordering

    if (!chat) {
      chat = this.chatRepository.create({
        userId: userId,
        messages: [], // This will be initialized by @BeforeInsert hook
      });
      // Save immediately to get the ID and establish relationship
      chat = await this.chatRepository.save(chat);
    }

    // Get AI response
    const aiResponse = await this.getAIResponse(query, user);

    // Add message to chat
    chat.addMessage(query, aiResponse.data.message || aiResponse.data.error);

    // ✅ COORDINATION FIX: Update user's lastChatAt field
    user.lastChatAt = new Date();

    // Update user stage if AI suggests advancement
    if (aiResponse.advanceStage && user.currentStage < KYCStage.APPROVED) {
      user.advanceStage(); // This already updates lastChatAt internally
    }

    // ✅ COORDINATION FIX: Save chat first to update its updatedAt, then user
    const savedChat = await this.chatRepository.save(chat);
    const savedUser = await this.userRepository.save(user);

    return {
      response: aiResponse.data.message || aiResponse.data.error,
      currentStage: savedUser.currentStage,
      stageName: KYCStage[savedUser.currentStage],
      stageProgress: savedUser.getStageProgress(),
      chatId: savedChat.id,
      messageCount: savedChat.getMessageCount(),
      stageChanged: aiResponse.advanceStage || false,
      suggestions: aiResponse.suggestions,
      metadata: aiResponse.metadata,
      // ✅ NEW: Include chat coordination info
      chatInfo: {
        isNewChat: !user.chats?.length,
        totalUserChats: await this.getUserChatCount(userId),
        lastChatAt: savedUser.lastChatAt,
      },
    };
  }

  async getChatHistory(userId: string, limit: number = 50): Promise<any[]> {
    // ✅ FIX: Order by updatedAt DESC to get most recent chat
    const chat = await this.chatRepository.findOne({
      where: { userId },
      order: { updatedAt: "DESC" },
    });

    if (!chat || !chat.messages) {
      return [];
    }

    // Return last N messages (most recent first)
    return chat.messages.slice(-limit).reverse();
  }

  // ✅ NEW: Get all chat messages across all user's chats
  async getAllUserChatHistory(
    userId: string,
    limit: number = 100
  ): Promise<any> {
    const chats = await this.chatRepository.find({
      where: { userId },
      order: { updatedAt: "DESC" },
    });

    if (!chats || chats.length === 0) {
      return {
        messages: [],
        totalChats: 0,
        totalMessages: 0,
      };
    }

    // Combine all messages from all chats
    const allMessages: any[] = [];
    chats.forEach((chat) => {
      if (chat.messages) {
        chat.messages.forEach((message) => {
          allMessages.push({
            ...message,
            chatId: chat.id,
            chatCreatedAt: chat.createdAt,
          });
        });
      }
    });

    // Sort by timestamp (most recent first) and limit
    allMessages.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      messages: allMessages.slice(0, limit),
      totalChats: chats.length,
      totalMessages: allMessages.length,
      chats: chats.map((chat) => ({
        id: chat.id,
        messageCount: chat.getMessageCount(),
        lastMessage: chat.getLastMessage(),
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      })),
    };
  }

  // ============ USER PROGRESS METHODS ============

  async getUserProgress(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: ["KYCSessions", "chats"],
      order: {
        chats: {
          updatedAt: "DESC",
        },
      },
    });

    if (!user) {
      throw new ApiError(StatusCode.NOT_FOUND, "User not found");
    }

    // ✅ COORDINATION FIX: Calculate accurate chat statistics
    const totalChatMessages =
      user.chats?.reduce((total, chat) => total + chat.getMessageCount(), 0) ||
      0;

    const mostRecentChat = user.chats?.[0];
    const lastChatActivity = mostRecentChat?.updatedAt || user.lastChatAt;

    return {
      userId: user.id,
      currentStage: user.currentStage,
      stageName: KYCStage[user.currentStage],
      stageProgress: user.getStageProgress(),
      canAdvanceToNextStage: this.canUserAdvance(user),
      totalKYCSessions: user.KYCSessions?.length || 0,
      successfulSessions:
        user.KYCSessions?.filter(
          (s) => s.status === "completed" || s.status === "verified"
        ).length || 0,
      // ✅ ENHANCED: Better chat statistics
      chatStats: {
        totalChats: user.chats?.length || 0,
        totalChatMessages,
        averageMessagesPerChat:
          user.chats?.length > 0
            ? Math.round(totalChatMessages / user.chats.length)
            : 0,
        mostRecentChatId: mostRecentChat?.id || null,
        lastChatActivity,
        userLastChatAt: user.lastChatAt,
      },
      lastActivity: user.updatedAt,
    };
  }

  async getStageInfo(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });

    if (!user) {
      throw new ApiError(StatusCode.NOT_FOUND, "User not found");
    }

    const stageInfo = this.getStageGuidance(user.currentStage);

    return {
      currentStage: user.currentStage,
      stageName: KYCStage[user.currentStage],
      stageProgress: user.getStageProgress(),
      ...stageInfo,
      canAdvance: this.canUserAdvance(user),
    };
  }

  // ============ ADMIN METHODS ============

  async getChatAnalytics(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: ["chats", "KYCSessions"],
      order: {
        chats: {
          updatedAt: "DESC",
        },
      },
    });

    if (!user) {
      throw new ApiError(StatusCode.NOT_FOUND, "User not found");
    }

    const totalMessages =
      user.chats?.reduce((total, chat) => total + chat.getMessageCount(), 0) ||
      0;
    const totalChats = user.chats?.length || 0;

    // ✅ ENHANCED: More detailed chat analytics
    const chatDetails =
      user.chats?.map((chat) => ({
        chatId: chat.id,
        messageCount: chat.getMessageCount(),
        lastMessage: chat.getLastMessage(),
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        daysSinceCreated: Math.floor(
          (new Date().getTime() - chat.createdAt.getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      })) || [];

    return {
      userId: user.id,
      userName: user.name,
      email: user.email,
      currentStage: user.currentStage,
      stageName: KYCStage[user.currentStage],
      stageProgress: user.getStageProgress(),
      chatStats: {
        totalChats: totalChats,
        totalMessages: totalMessages,
        averageMessagesPerChat:
          totalChats > 0 ? Math.round(totalMessages / totalChats) : 0,
        lastChatAt: user.chats?.[0]?.updatedAt || null,
        userLastChatAt: user.lastChatAt,
        // ✅ NEW: Detailed chat breakdown
        chatDetails,
        emptyChats: chatDetails.filter((chat) => chat.messageCount === 0)
          .length,
        activeChats: chatDetails.filter((chat) => chat.messageCount > 0).length,
      },
      kycStats: {
        totalSessions: user.KYCSessions?.length || 0,
        completedSessions:
          user.KYCSessions?.filter((s) => s.status === "completed").length || 0,
        verifiedSessions:
          user.KYCSessions?.filter((s) => s.status === "verified").length || 0,
        failedSessions:
          user.KYCSessions?.filter((s) => s.status === "failed").length || 0,
      },
      registeredAt: user.createdAt,
      lastActivity: user.updatedAt,
    };
  }

  // ============ HELPER METHODS ============

  // ✅ NEW: Get user's chat count efficiently
  private async getUserChatCount(userId: string): Promise<number> {
    return await this.chatRepository.count({
      where: { userId },
    });
  }

  // ✅ NEW: Cleanup empty chats (utility method)
  async cleanupEmptyChats(userId: string): Promise<number> {
    const emptyChats = await this.chatRepository.find({
      where: { userId },
    });

    const toDelete = emptyChats.filter((chat) => chat.getMessageCount() === 0);

    if (toDelete.length > 0) {
      await this.chatRepository.remove(toDelete);
    }

    return toDelete.length;
  }

  // ============ PRIVATE HELPER METHODS ============

  private async getAIResponse(
    query: string,
    user: User,
    file?: Express.Multer.File
  ) {
    try {
      const response = await fetch(
        `${process.env.AI_BACKEND_URL}/chatbot/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            userId: user.id,
            currentStage: user.currentStage,
            userContext: {
              name: user.name,
              email: user.email,
              totalKYCSessions: user.KYCSessions?.length || 0,
              successfulSessions:
                user.KYCSessions?.filter(
                  (s) => s.status === "completed" || s.status === "verified"
                ).length || 0,
              // ✅ ENHANCED: Include chat context
              totalChatMessages:
                user.chats?.reduce(
                  (total, chat) => total + chat.getMessageCount(),
                  0
                ) || 0,
              lastChatAt: user.lastChatAt,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`AI Backend responded with status: ${response.status}`);
      }
      const data = await response.json();
      console.log(data);
      return data;
    } catch (error: any) {
      console.error("AI Backend Error:", error.message);

      // Fallback response when AI is unavailable
      return {
        message: `I understand you said: "${query}". I'm currently experiencing technical difficulties. Please try again in a moment or contact support if the issue persists.`,
        advanceStage: false,
        suggestions: [
          "Try your message again",
          "Contact support if issues continue",
        ],
      };
    }
  }

  private canUserAdvance(user: User): boolean {
    // Define advancement logic based on your KYC flow
    switch (user.currentStage) {
      case KYCStage.NOT_STARTED:
        return true; // Can always start
      case KYCStage.DOCUMENT_UPLOAD:
        return (user.KYCSessions?.length || 0) > 0; // Has uploaded at least one document
      case KYCStage.DOCUMENT_PROCESSING:
        return (
          (user.KYCSessions?.filter((s) => s.status === "completed").length ||
            0) > 0
        );
      case KYCStage.LIVENESS_CHECK:
      case KYCStage.FACE_VERIFICATION:
        return (
          (user.KYCSessions?.filter((s) => s.status === "verified").length ||
            0) > 0
        );
      case KYCStage.APPROVED:
        return false; // Already completed
      default:
        return false;
    }
  }

  private getStageGuidance(stage: KYCStage) {
    const guidance = {
      [KYCStage.FLAGGED]: {
        title: "Flagged",
        description: "Flagged",
        nextSteps: ["Admin Review", "Manual review"],
        tips: [],
      },
      [KYCStage.REJECTED]: {
        title: "Rejected",
        description: "Rejected",
        nextSteps: ["Try again", "Contact support"],
        tips: [
          "Ensure good lighting",
          "Keep document flat",
          "All corners visible",
        ],
      },
      [KYCStage.NOT_STARTED]: {
        title: "Welcome to KYC Verification",
        description:
          "Let's get started with your identity verification process",
        nextSteps: ["Upload your identity document"],
        tips: [
          "Ensure good lighting",
          "Keep document flat",
          "All corners visible",
        ],
      },
      [KYCStage.DOCUMENT_UPLOAD]: {
        title: "Upload Identity Document",
        description: "Please upload a clear photo of your identity document",
        nextSteps: [
          "Take a clear photo of your ID",
          "Ensure all details are visible",
        ],
        tips: [
          "PAN Card, Aadhaar, or Passport accepted",
          "JPG or PNG format",
          "Max 5MB size",
        ],
      },
      [KYCStage.DOCUMENT_PROCESSING]: {
        title: "Document Processing",
        description: "Your document is being processed and verified",
        nextSteps: ["Wait for processing to complete"],
        tips: [
          "This usually takes 1-2 minutes",
          "Please don't refresh the page",
        ],
      },
      [KYCStage.LIVENESS_CHECK]: {
        title: "Liveness Verification",
        description:
          "Complete the liveness check to verify you're a real person",
        nextSteps: ["Start liveness check", "Follow on-screen instructions"],
        tips: [
          "Ensure good lighting",
          "Look directly at camera",
          "Follow prompts carefully",
        ],
      },
      [KYCStage.FACE_VERIFICATION]: {
        title: "Face Matching",
        description: "We'll match your live photo with your document photo",
        nextSteps: ["Take a clear selfie", "Ensure good lighting conditions"],
        tips: [
          "Same lighting as document",
          "Face clearly visible",
          "Remove glasses if needed",
        ],
      },
      [KYCStage.VIDEO_KYC]: {
        title: "Video KYC Session",
        description: "Complete a video call with our verification agent",
        nextSteps: ["Schedule video call", "Prepare your documents"],
        tips: [
          "Have original documents ready",
          "Stable internet connection",
          "Quiet environment",
        ],
      },
      [KYCStage.COMPLIANCE_CHECK]: {
        title: "Final Verification",
        description: "Final compliance and background checks in progress",
        nextSteps: ["Wait for final verification"],
        tips: ["This may take 24-48 hours", "You'll be notified via email"],
      },
      [KYCStage.APPROVED]: {
        title: "KYC Completed ✅",
        description: "Your KYC verification is complete!",
        nextSteps: ["Access full services"],
        tips: ["You can now use all platform features"],
      },
    };

    return guidance[stage] || guidance[KYCStage.NOT_STARTED];
  }
}
