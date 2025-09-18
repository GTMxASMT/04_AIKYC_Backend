import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { validateDTO } from "../middlewares/validation.middleware";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { uploadSingle } from "../middlewares/multer.middleware";
import {
  CreateUserDTO,
  UpdateUserDTO,
  LoginDTO,
  RefreshTokenDTO,
} from "../DTOs/user.dto";

const router = Router();

// ================================ PUBLIC ROUTES ================================
router.post("/register", validateDTO(CreateUserDTO), userController.register);
router.post("/login", validateDTO(LoginDTO), userController.login);
router.post(
  "/refresh-token",
  validateDTO(RefreshTokenDTO),
  userController.refreshToken
);
router.get("/get-user/:id", userController.getUserById);

router.post("/forget-password", userController.forgetPassword);
router.post("/reset-password", userController.resetPassword);

// ================================ PROTECTED ROUTES (Authentication Required) ================================
router.use(authenticate);

// =============== Basic User Operations ===============
router.post("/logout", userController.logout);
router.get("/profile", userController.getProfile);
router.post(
  "/upload-profile-image",
  uploadSingle("profileImage"),
  userController.uploadProfileImage
);
router.put("/:id", validateDTO(UpdateUserDTO), userController.updateUser);
router.get("/:id", userController.getUserById);

router.post("/change-password", userController.changePassword);

// =============== KYC Status & Session Management ===============
router.get("/kyc/status", userController.getKYCStatus);
router.get("/kyc/sessions", userController.getUserKYCSessions);
router.get("/kyc/session/:sessionId", userController.getKYCSession);

export default router;
