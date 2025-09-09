// XWebrtc.service.ts
import { Repository } from "typeorm";
import { AppDataSource } from "../database/db";
import { VideoSession } from "../entities/VideoSession.entity";
import { User } from "../entities/User.entity";
import { UserKYCSession } from "../entities/UserKYCSession.entity";
import { ApiError } from "../utilities/ApiError";
import { UserRole, KYCStage, Status, FRONTEND_URL } from "../config";
import { sendMail } from "../core/sendMail";

interface SessionParticipant {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  joinedAt: Date;
  socketId?: string;
}

interface VerificationData {
  checklist: Array<{
    id?: string;
    item: string;
    status: boolean;
    notes?: string;
  }>;
  status: "approved" | "rejected" | "pending";
  notes?: string;
  ipAddress?: string;
  geoLocation?: string;
  time?: string;
}

interface SessionInfo {
  sessionId: string;
  status: "active" | "completed" | "cancelled";
  participants: SessionParticipant[];
  createdAt: Date;
  createdBy: string; // Agent who created the session
  targetUserId: string; // User who should join for KYC
  kycSessionId?: string;
  recording?: {
    isRecording: boolean;
    startedAt?: Date;
    stoppedAt?: Date;
  };
}

export class XWebRTCService {
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionRepository = AppDataSource.getRepository(VideoSession);
  private userRepository = AppDataSource.getRepository(User);
  private kycSessionRepository = AppDataSource.getRepository(UserKYCSession);

  // Generate unique session ID
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  }

  async getUserById(userId: string): Promise<any | null> {
    const userData = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["KYCSessions"],
    });

    const data = {
      name: userData?.name,
      email: userData?.email,
      extracted_data: userData?.KYCSessions?.[0]?.EPIC1?.data?.extracted_data,
      uploaded_doc: userData?.KYCSessions?.[0]?.EPIC1?.data?.predicted_class,
    };
    return data;
  }

  async getVideoKYCUsers(): Promise<User[]> {
    return this.userRepository.find(
      // {where:{isActive:true , role:UserRole.USER, currentStage:KYCStage.VIDEO_KYC}}
      { where: { isActive: true, role: UserRole.USER } }
    );
  }

  async selectVideoKYCUser(userId: string): Promise<any> {
    //agent chooses user for video kyc and sends him a mail with sessionID and link to join
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true, role: UserRole.USER },
    });
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const sessionId = this.generateSessionId();

    if (!user.email) {
      throw new ApiError(400, "User does not have a valid email address");
    }

    const emailBody = `Hello ${user.name},<br/><br/>
    You have been selected for a Video KYC session. Please use the following session ID to join the session:<br/><br/>
    <b>Session ID: ${sessionId}</b><br/><br/>
    Click <a href="${FRONTEND_URL}video-kyc/${sessionId}">here</a> to join the session.<br/><br/>
    Best regards,<br/>
    AI KYC Team
    `;

    //sendmail
    await sendMail(user.email, "Video KYC Link", emailBody);

    return { sessionId, userId, user };
  }
  // Create session (only agents/admins can do this)
  async createSession(
    agentId: string,
    targetUserId: string,
    sessionId: string,
    metadata?: any
  ): Promise<SessionInfo> {
    const agent = await this.userRepository.findOne({
      where: { id: agentId, isActive: true },
    });

    if (!agent) {
      throw new ApiError(404, "Agent not found");
    }

    if (agent.role !== UserRole.AGENT && agent.role !== UserRole.ADMIN) {
      throw new ApiError(403, "Only agents or admins can create sessions");
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId, isActive: true },
      relations: ["KYCSessions"],
    });

    if (!targetUser) {
      throw new ApiError(404, "Target user not found");
    }

    if (targetUser.role !== UserRole.USER) {
      throw new ApiError(400, "Target must be a user role");
    }

    const activeKYCSession = await this.kycSessionRepository.findOne({
      where: {
        userId: targetUserId,
        status: Status.PENDING,
      },
      order: { createdAt: "DESC" },
    });

    if (!activeKYCSession) {
      throw new ApiError(
        400,
        "User must complete document processing and face verification before Video KYC"
      );
    }

    // Verify EPIC1 and EPIC2 are completed
    if (
      activeKYCSession.EPIC1?.status !== "completed" ||
      activeKYCSession.EPIC2?.status !== "completed"
    ) {
      throw new ApiError(
        400,
        "User must complete document processing and face verification before Video KYC"
      );
    }

    await this.kycSessionRepository.update(activeKYCSession.id, {
      EPIC3: {
        status: Status.PENDING,
        message: "Video KYC session started",
        data: {
          videoSessionId: sessionId,
          startedAt: new Date().toISOString(),
          agentId: agentId,
        },
        meta: metadata,
      } as any,
    });

    // Update user stage to VIDEO_KYC if needed
    if (targetUser.currentStage < KYCStage.VIDEO_KYC) {
      await this.userRepository.update(targetUserId, {
        currentStage: KYCStage.VIDEO_KYC,
        lastChatAt: new Date(),
      });
    }

    // Create session in database
    const videoSession = this.sessionRepository.create({
      sessionId,
      status: "active",
      createdBy: agentId,
      metadata: {
        kycSessionId: activeKYCSession.id,
        targetUserId: targetUserId,
        agentId: agentId,
        sessionType: "kyc_verification",
        participants: [],
      },
    });

    await this.sessionRepository.save(videoSession);

    // Create in-memory session with agent already joined
    const sessionInfo: SessionInfo = {
      sessionId,
      status: "active",
      participants: [
        {
          userId: agentId,
          name: agent.name,
          email: agent.email,
          role: agent.role,
          joinedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      createdBy: agentId,
      targetUserId: targetUserId,
      kycSessionId: activeKYCSession.id,
      recording: {
        isRecording: false,
      },
    };

    this.sessions.set(sessionId, sessionInfo);

    // Update database with agent as participant
    await this.sessionRepository.update(
      { sessionId },
      {
        metadata: {
          ...videoSession.metadata,
          participants: sessionInfo.participants,
          lastUpdated: new Date(),
        } as any,
      }
    );

    console.log(
      `Agent ${agent.name} created and joined session ${sessionId} for user ${targetUser.name}`
    );

    return sessionInfo;
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Check database
      const dbSession = await this.sessionRepository.findOne({
        where: { sessionId },
      });

      if (dbSession && dbSession.status === "active") {
        // Recreate in memory from database
        session = {
          sessionId: dbSession.sessionId,
          status: dbSession.status as "active" | "completed" | "cancelled",
          participants: (dbSession.metadata?.participants || []).map(
            (p: any) => ({ ...p, role: p.role as UserRole })
          ),
          createdAt: dbSession.createdAt,
          createdBy: dbSession.createdBy,
          targetUserId: dbSession.metadata?.targetUserId,
          kycSessionId: dbSession.metadata?.kycSessionId,
          recording: {
            isRecording: false,
          },
        };
        this.sessions.set(sessionId, session);
      }
    }

    return session || null;
  }

  async joinSession(
    sessionId: string,
    user: { userId: string; name: string; email: string; role: UserRole },
    metadata?: any
  ): Promise<{
    session: SessionInfo;
    participant: SessionParticipant;
    message: string;
  }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    if (session.status !== "active") {
      throw new ApiError(400, "Session is not active");
    }

    // Check if user already in session
    const existingParticipant = session.participants.find(
      (p) => p.userId === user.userId
    );

    if (existingParticipant) {
      return {
        session,
        participant: existingParticipant,
        message: "Already in session",
      };
    }

    // Validate maximum 2 participants
    if (session.participants.length >= 2) {
      throw new ApiError(
        400,
        "Session is full. Maximum 2 participants allowed."
      );
    }

    // Role-based validation
    const hasAgent = session.participants.some(
      (p) => p.role === UserRole.AGENT || p.role === UserRole.ADMIN
    );
    const hasUser = session.participants.some((p) => p.role === UserRole.USER);

    if (user.role === UserRole.USER) {
      // User can join if:
      // 1. They are the target user for this session
      // 2. An agent is already present
      // 3. No other user is present

      if (user.userId !== session.targetUserId) {
        throw new ApiError(
          403,
          "You are not authorized to join this KYC session"
        );
      }

      if (!hasAgent) {
        throw new ApiError(400, "Agent must be present before user can join");
      }

      if (hasUser) {
        throw new ApiError(400, "Another user is already in this session");
      }
    } else if (user.role === UserRole.AGENT || user.role === UserRole.ADMIN) {
      if (hasAgent && session.createdBy !== user.userId) {
        throw new ApiError(400, "Another agent is already in this session");
      }
    } else {
      throw new ApiError(403, "Invalid user role for joining sessions");
    }

    // Add participant
    const participant: SessionParticipant = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      joinedAt: new Date(),
    };

    session.participants.push(participant);

    // Update database
    await this.sessionRepository.update(
      { sessionId },
      {
        metadata: {
          participants: session.participants,
          lastUpdated: new Date(),
        } as any,
      }
    );

    if (session.kycSessionId && hasAgent && user.role === UserRole.USER) {
      const agentParticipant = session.participants.find(
        (p) => p.role === UserRole.AGENT || p.role === UserRole.ADMIN
      );

      // Safely convert joinedAt to ISO string
      const agentJoinedAt = agentParticipant?.joinedAt
        ? agentParticipant.joinedAt instanceof Date
          ? agentParticipant.joinedAt.toISOString()
          : new Date(agentParticipant.joinedAt).toISOString()
        : null;

      await this.kycSessionRepository.update(session.kycSessionId, {
        EPIC3: {
          status: "processing",
          message: "Video KYC in progress - both participants joined",
          data: {
            videoSessionId: sessionId,
            agentJoinedAt: agentJoinedAt,
            userJoinedAt: new Date().toISOString(),
            participants: session.participants.map((p) => ({
              userId: p.userId,
              name: p.name,
              role: p.role,
              joinedAt:
                p.joinedAt instanceof Date
                  ? p.joinedAt.toISOString()
                  : new Date(p.joinedAt).toISOString(),
            })),
          },
          meta: metadata,
        } as any,
      });
    }

    const message =
      user.role === UserRole.USER
        ? "User joined KYC session successfully"
        : "Agent joined session successfully";

    console.log(`${user.role} ${user.name} joined session ${sessionId}`);

    return { session, participant, message };
  }
  async leaveSession(
    sessionId: string,
    userId: string
  ): Promise<{ message: string; sessionStatus: string }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    const leavingParticipant = session.participants.find(
      (p) => p.userId === userId
    );

    if (!leavingParticipant) {
      throw new ApiError(400, "You are not a participant in this session");
    }

    // Remove participant
    session.participants = session.participants.filter(
      (p) => p.userId !== userId
    );

    // Update database
    await this.sessionRepository.update(
      { sessionId },
      {
        metadata: {
          participants: session.participants,
          lastUpdated: new Date(),
        } as any,
      }
    );

    let message = `${leavingParticipant.role} left the session`;
    let sessionStatus = "active";

    // Handle session completion/cancellation
    if (session.participants.length === 0) {
      // No participants left - cancel session
      session.status = "cancelled";
      sessionStatus = "cancelled";
      message = "Session cancelled - all participants left";

      await this.sessionRepository.update(
        { sessionId },
        {
          status: "cancelled",
          endedAt: new Date(),
        }
      );

      // Update EPIC3 if session was cancelled without verification
      if (session.kycSessionId) {
        const kycSession = await this.kycSessionRepository.findOne({
          where: { id: session.kycSessionId },
        });

        if (
          kycSession &&
          kycSession.EPIC3 &&
          kycSession.EPIC3.status === Status.PENDING
        ) {
          await this.kycSessionRepository.update(session.kycSessionId, {
            EPIC3: {
              ...kycSession.EPIC3,
              status: Status.FAILED,
              message:
                "Video KYC session cancelled - participants left without verification",
              data: {
                ...kycSession.EPIC3.data,
                cancelledAt: new Date().toISOString(),
                reason: "session_cancelled",
              },
            } as any,
          });
        }
      }

      this.sessions.delete(sessionId);
    } else if (
      leavingParticipant.role === UserRole.USER &&
      session.kycSessionId
    ) {
      // User left but agent still present - mark as incomplete
      const kycSession = await this.kycSessionRepository.findOne({
        where: { id: session.kycSessionId },
      });

      if (
        kycSession &&
        kycSession.EPIC3 &&
        kycSession.EPIC3.status === Status.PENDING
      ) {
        await this.kycSessionRepository.update(session.kycSessionId, {
          EPIC3: {
            ...kycSession.EPIC3,
            status: "failed",
            message: "Video KYC incomplete - user left session",
            data: {
              ...kycSession.EPIC3.data,
              userLeftAt: new Date().toISOString(),
              reason: "user_left_session",
            },
          } as any,
        });
      }
    }

    console.log(
      `${leavingParticipant.role} ${leavingParticipant.name} left session ${sessionId}`
    );

    return { message, sessionStatus };
  }

  async submitVerification(
    sessionId: string,
    agentId: string,
    verificationData: VerificationData
  ): Promise<VerificationData> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    // Verify agent is in session
    const agent = session.participants.find(
      (p) =>
        p.userId === agentId &&
        (p.role === UserRole.AGENT || p.role === UserRole.ADMIN)
    );

    if (!agent) {
      throw new ApiError(403, "Only session agents can submit verification");
    }

    // Verify there's a user in the session
    const user = session.participants.find((p) => p.role === UserRole.USER);

    if (!user) {
      throw new ApiError(
        400,
        "Cannot submit verification - no user present in session"
      );
    }

    // Update database session
    await this.sessionRepository.update(
      { sessionId },
      {
        verificationData: verificationData as any,
        verificationStatus: verificationData.status,
        verifiedBy: agentId,
        verifiedAt: new Date(),
        status: verificationData.status === "pending" ? "active" : "completed",
        endedAt: verificationData.status === "pending" ? undefined : new Date(),
      }
    );

    // Update session status if completed
    if (verificationData.status !== "pending") {
      session.status = "completed";
    }

    // Update EPIC3 and user stage based on verification
    if (session.kycSessionId) {
      const epic3Status =
        verificationData.status === "approved" ? "completed" : "failed";
      const kycStatus =
        verificationData.status === "approved"
          ? Status.COMPLETED
          : Status.REJECTED;

      await this.kycSessionRepository.update(session.kycSessionId, {
        EPIC3: {
          status: epic3Status,
          message:
            verificationData.status === "approved"
              ? "Video KYC completed successfully"
              : "Video KYC verification failed",
          data: {
            videoSessionId: sessionId,
            checklist: verificationData.checklist,
            verificationStatus: verificationData.status,
            participants: session.participants.map((p) => ({
              userId: p.userId,
              name: p.name,
              role: p.role,
              joinedAt: p.joinedAt,
            })),
          },
          meta: {
            verifiedAt: new Date().toISOString(),
            agentId: agentId,
            ipAddress: verificationData.ipAddress,
            geoLocation: verificationData.geoLocation,
            time: verificationData.time,
            consent: verificationData.status,
          },
        } as any,
        status: kycStatus,
        completedAt:
          verificationData.status === "approved" ? new Date() : undefined,
      });

      // Update user stage
      if (user) {
        const newStage =
          verificationData.status === "approved"
            ? KYCStage.COMPLIANCE_CHECK
            : KYCStage.REJECTED;

        await this.userRepository.update(user.userId, {
          currentStage: newStage,
          lastChatAt: new Date(),
        });

        console.log(
          `User ${user.userId} stage updated to ${newStage} after Video KYC ${verificationData.status}`
        );
      }
    }

    console.log(
      `Verification submitted for session ${sessionId}: ${verificationData.status}`
    );

    return verificationData;
  }

  async getSessionParticipants(
    sessionId: string
  ): Promise<SessionParticipant[]> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    return session.participants;
  }

  async startRecording(
    sessionId: string,
    agentId: string
  ): Promise<{ isRecording: boolean; startedAt: Date }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    // Verify agent is in session
    const agent = session.participants.find(
      (p) =>
        p.userId === agentId &&
        (p.role === UserRole.AGENT || p.role === UserRole.ADMIN)
    );

    if (!agent) {
      throw new ApiError(403, "Only session agents can control recording");
    }

    if (session.recording?.isRecording) {
      throw new ApiError(400, "Recording already in progress");
    }

    const startedAt = new Date();
    session.recording = {
      isRecording: true,
      startedAt,
    };

    // Update database
    await this.sessionRepository.update(
      { sessionId },
      {
        startedAt,
        metadata: {
          recording: session.recording,
          lastUpdated: new Date(),
        } as any,
      }
    );

    // Update EPIC3 with recording info
    if (session.kycSessionId) {
      const kycSession = await this.kycSessionRepository.findOne({
        where: { id: session.kycSessionId },
      });

      if (kycSession?.EPIC3) {
        await this.kycSessionRepository.update(session.kycSessionId, {
          EPIC3: {
            ...kycSession.EPIC3,
            data: {
              ...kycSession.EPIC3.data,
              recordingStarted: true,
              recordingStartedAt: startedAt.toISOString(),
            },
          } as any,
        });
      }
    }

    return { isRecording: true, startedAt };
  }

  async stopRecording(
    sessionId: string,
    agentId: string
  ): Promise<{ isRecording: boolean; stoppedAt: Date }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    // Verify agent is in session
    const agent = session.participants.find(
      (p) =>
        p.userId === agentId &&
        (p.role === UserRole.AGENT || p.role === UserRole.ADMIN)
    );

    if (!agent) {
      throw new ApiError(403, "Only session agents can control recording");
    }

    if (!session.recording?.isRecording) {
      throw new ApiError(400, "No recording in progress");
    }

    const stoppedAt = new Date();
    session.recording = {
      ...session.recording,
      isRecording: false,
      stoppedAt,
    };

    // Update database
    await this.sessionRepository.update(
      { sessionId },
      {
        metadata: {
          recording: session.recording,
          lastUpdated: new Date(),
        } as any,
      }
    );

    // Update EPIC3 with recording info
    if (session.kycSessionId) {
      const kycSession = await this.kycSessionRepository.findOne({
        where: { id: session.kycSessionId },
      });

      if (kycSession?.EPIC3) {
        const duration = session.recording.startedAt
          ? Math.floor(
              (stoppedAt.getTime() - session.recording.startedAt.getTime()) /
                1000
            )
          : 0;

        await this.kycSessionRepository.update(session.kycSessionId, {
          EPIC3: {
            ...kycSession.EPIC3,
            data: {
              ...kycSession.EPIC3.data,
              recordingStoppedAt: stoppedAt.toISOString(),
              recordingDuration: duration,
            },
          } as any,
        });
      }
    }

    return { isRecording: false, stoppedAt };
  }

  async getHealthStatus(): Promise<any> {
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.status === "active"
    );

    const kycSessions = activeSessions.filter((s) => s.kycSessionId);

    return {
      status: "healthy",
      activeSessions: activeSessions.length,
      activeKYCSessions: kycSessions.length,
      totalSessions: this.sessions.size,
      timestamp: new Date(),
    };
  }

  async getStats(): Promise<any> {
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.status === "active"
    );

    const completedSessions = Array.from(this.sessions.values()).filter(
      (s) => s.status === "completed"
    );

    const kycSessions = Array.from(this.sessions.values()).filter(
      (s) => s.kycSessionId
    );

    const totalParticipants = activeSessions.reduce(
      (sum, session) => sum + session.participants.length,
      0
    );

    return {
      activeSessions: activeSessions.length,
      completedSessions: completedSessions.length,
      totalSessions: this.sessions.size,
      kycSessions: kycSessions.length,
      totalParticipants,
      sessions: activeSessions.map((s) => ({
        sessionId: s.sessionId,
        participantCount: s.participants.length,
        status: s.status,
        isKYCSession: !!s.kycSessionId,
        createdAt: s.createdAt,
        targetUser: s.targetUserId,
        createdBy: s.createdBy,
      })),
    };
  }

  // Helper method to clean up inactive sessions
  async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = session.createdAt.getTime();
      if (
        now.getTime() - lastActivity > inactiveThreshold &&
        (session.participants.length === 0 || session.status !== "active")
      ) {
        session.status = "cancelled";

        // Update database
        await this.sessionRepository.update(
          { sessionId },
          {
            status: "cancelled",
            endedAt: now,
          }
        );

        // Update EPIC3 if this was a KYC session
        if (session.kycSessionId) {
          const kycSession = await this.kycSessionRepository.findOne({
            where: { id: session.kycSessionId },
          });

          if (kycSession?.EPIC3 && kycSession.EPIC3.status === Status.PENDING) {
            await this.kycSessionRepository.update(session.kycSessionId, {
              EPIC3: {
                ...kycSession.EPIC3,
                status: "failed",
                message: "Video KYC session timed out due to inactivity",
                data: {
                  ...kycSession.EPIC3.data,
                  timeoutAt: now.toISOString(),
                  reason: "session_timeout",
                },
              } as any,
            });
          }
        }

        this.sessions.delete(sessionId);
        console.log(`Cleaned up inactive session: ${sessionId}`);
      }
    }
  }

  // Get KYC session details for a video session
  async getKYCSessionDetails(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId);

    if (!session || !session.kycSessionId) {
      return null;
    }

    const kycSession = await this.kycSessionRepository.findOne({
      where: { id: session.kycSessionId },
      relations: ["user"],
    });

    if (!kycSession) {
      return null;
    }

    return {
      kycSessionId: kycSession.id,
      userId: kycSession.userId,
      userName: kycSession.user.name,
      userEmail: kycSession.user.email,
      documentType: kycSession.documentType,
      fileURL: kycSession.fileURL,
      epic1Status: kycSession.EPIC1?.status,
      epic2Status: kycSession.EPIC2?.status,
      epic3Status: kycSession.EPIC3?.status,
      currentUserStage: kycSession.user.currentStage,
      userVerified: kycSession.user.Verified,
      sessionParticipants: session.participants,
      sessionStatus: session.status,
      createdBy: session.createdBy,
      targetUserId: session.targetUserId,
    };
  }

  // Get all active sessions for admin monitoring
  async getActiveSessions(): Promise<SessionInfo[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === "active"
    );
  }

  // Force close a session (admin only)
  async forceCloseSession(sessionId: string, adminId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    session.status = "cancelled";

    // Update database
    await this.sessionRepository.update(
      { sessionId },
      {
        status: "cancelled",
        endedAt: new Date(),
        metadata: {
          ...session,
          forcedClosedBy: adminId,
          forcedClosedAt: new Date(),
        } as any,
      }
    );

    // Update EPIC3 if this was a KYC session
    if (session.kycSessionId) {
      const kycSession = await this.kycSessionRepository.findOne({
        where: { id: session.kycSessionId },
      });

      if (kycSession?.EPIC3 && kycSession.EPIC3.status === Status.PENDING) {
        await this.kycSessionRepository.update(session.kycSessionId, {
          EPIC3: {
            ...kycSession.EPIC3,
            status: "failed",
            message: "Video KYC session forcefully closed by admin",
            data: {
              ...kycSession.EPIC3.data,
              forcedClosedAt: new Date().toISOString(),
              forcedClosedBy: adminId,
              reason: "admin_force_close",
            },
          } as any,
        });
      }
    }

    this.sessions.delete(sessionId);
    console.log(`Session ${sessionId} forcefully closed by admin ${adminId}`);
  }
}
