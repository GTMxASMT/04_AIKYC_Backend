import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../config";

const router = Router();
const chatController = new ChatController();

// Apply authentication to all routes
router.use(authenticate);

router.get("/initialize", chatController.initialize);

// ============ CORE CHAT ENDPOINTS ============
router.post("/message", chatController.sendMessage);
router.get("/history", chatController.getChatHistory);

// ============ USER PROGRESS ENDPOINTS ============
router.get("/progress", chatController.getUserProgress);
router.get("/stage-info", chatController.getStageInfo);

// ============ ADMIN ENDPOINTS ============
router.get(
  "/analytics/:userId",
  authorize(UserRole.ADMIN),
  chatController.getChatAnalytics
);

export default router;
