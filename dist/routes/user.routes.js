"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const validation_middleware_1 = require("../middlewares/validation.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const user_dto_1 = require("../DTOs/user.dto");
const config_1 = require("../config");
const router = (0, express_1.Router)();
router.post("/register", (0, validation_middleware_1.validateDTO)(user_dto_1.CreateUserDTO), user_controller_1.userController.register);
router.post("/login", (0, validation_middleware_1.validateDTO)(user_dto_1.LoginDTO), user_controller_1.userController.login);
router.post("/refresh-token", (0, validation_middleware_1.validateDTO)(user_dto_1.RefreshTokenDTO), user_controller_1.userController.refreshToken);
router.get("/get-user/:id", user_controller_1.userController.getUserById);
// ---------- Protected routes (authentication required)  -----------
router.use(auth_middleware_1.authenticate);
// ---------- Applied authentication to all routes below  -----------
router.post("/logout", user_controller_1.userController.logout);
router.get("/profile", user_controller_1.userController.getProfile);
router.post("/upload-profile-image", (0, multer_middleware_1.uploadSingle)("profileImage"), user_controller_1.userController.uploadProfileImage);
router.put("/:id", (0, validation_middleware_1.validateDTO)(user_dto_1.UpdateUserDTO), user_controller_1.userController.updateUser);
router.get("/:id", user_controller_1.userController.getUserById);
// -----------   ADMIN ROUTES   -----------
router.get("/", (0, auth_middleware_1.authorize)(config_1.UserRole.ADMIN), user_controller_1.userController.getAllUsers);
router.delete("/:id", (0, auth_middleware_1.authorize)(config_1.UserRole.ADMIN), user_controller_1.userController.deleteUser);
exports.default = router;
