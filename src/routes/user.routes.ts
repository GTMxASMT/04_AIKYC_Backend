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
import { UserRole } from "../config";
import { validateSessionId } from "../middlewares/sessionValidate.middleware";

const router = Router();

// Public routes
router.post("/register", validateDTO(CreateUserDTO), userController.register);
router.post("/login", validateDTO(LoginDTO), userController.login);

router.post(
  "/refresh-token",
  validateDTO(RefreshTokenDTO),
  userController.refreshToken
);

router.get("/get-user/:id", userController.getUserById);

// ---------- Protected routes (authentication required)  -----------
router.use(authenticate);
// ---------- Applied authentication to all routes below  -----------

router.post("/logout", userController.logout);
router.get("/profile", userController.getProfile);
router.post(
  "/upload-profile-image",
  uploadSingle("profileImage"),
  userController.uploadProfileImage
);
router.put("/:id", validateDTO(UpdateUserDTO), userController.updateUser);
router.get("/:id", userController.getUserById);

// ------------------ AI Document Processing Routes ------------------

router.post(
  "/process-document",
  uploadSingle("image"),
  userController.processDocument
);

router.post("/start-liveness", userController.livenessStart);

router.get(
  "/liveness-result/:id",
  validateSessionId,
  userController.livenessResult
);
router.post(
  "/compare-faces",
  uploadSingle("image"),
  userController.compareFaces
);

// ------------------   ADMIN ROUTES   ----------------------
router.get("/", authorize(UserRole.ADMIN), userController.getAllUsers);
router.delete("/:id", authorize(UserRole.ADMIN), userController.deleteUser);

export default router;
