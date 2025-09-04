// XWebrtc.routes.ts
import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { XWebRTCController } from "../controllers/Xwebrtc.controller";
import { UserRole } from "../config";

const router = Router();
const webrtcController = new XWebRTCController();

// Session management routes

router.get(
  "/get-video-kyc-users",
  authenticate,
  webrtcController.getVideoKYCUsers
);
router.post(
  "/select-video-kyc-user/:userId",
  authenticate,
  webrtcController.selectVideoKYCUser
);

router.post(
  "/sessions",
  authenticate,
  authorize(UserRole.AGENT),
  webrtcController.createSession
);
router.get("/sessions/:sessionId", authenticate, webrtcController.getSession);
router.post(
  "/sessions/:sessionId/join",
  authenticate,
  webrtcController.joinSession
);
router.post(
  "/sessions/:sessionId/leave",
  authenticate,
  webrtcController.leaveSession
);
router.post(
  "/sessions/:sessionId/verify",
  authenticate,
  authorize(UserRole.AGENT, UserRole.ADMIN),
  webrtcController.submitVerification
);
router.get(
  "/sessions/:sessionId/participants",
  authenticate,
  webrtcController.getParticipants
);

// Recording management (agent only)
router.post(
  "/sessions/:sessionId/recording/start",
  authenticate,
  authorize(UserRole.AGENT, UserRole.ADMIN),
  webrtcController.startRecording
);
router.post(
  "/sessions/:sessionId/recording/stop",
  authenticate,
  authorize(UserRole.AGENT, UserRole.ADMIN),
  webrtcController.stopRecording
);

// Session status and health
router.get("/health", webrtcController.getHealth);
router.get("/stats", authenticate, webrtcController.getStats);

export default router;
