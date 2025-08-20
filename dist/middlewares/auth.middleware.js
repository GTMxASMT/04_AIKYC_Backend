"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../database/db");
const User_entity_1 = require("../entities/User.entity");
const ApiError_1 = require("../utilities/ApiError");
const AsyncHandler_1 = require("../utilities/AsyncHandler");
const config_1 = require("../config");
exports.authenticate = (0, AsyncHandler_1.asyncHandler)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let token = (_a = req.header("Authorization")) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", "");
    // Also check cookies if no header token
    if (!token && ((_b = req.cookies) === null || _b === void 0 ? void 0 : _b.accessToken)) {
        token = req.cookies.accessToken;
    }
    if (!token) {
        throw new ApiError_1.ApiError(401, "Access denied. No token provided.");
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.accessSecret);
        const userRepository = db_1.AppDataSource.getRepository(User_entity_1.User);
        const user = yield userRepository.findOne({
            where: { id: decoded.id, isActive: true },
        });
        if (!user) {
            throw new ApiError_1.ApiError(401, "Invalid token. User not found.");
        }
        req.user = user;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new ApiError_1.ApiError(401, "Invalid token.");
        }
        throw error;
    }
}));
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new ApiError_1.ApiError(401, "Authentication required");
        }
        if (!roles.includes(req.user.role)) {
            throw new ApiError_1.ApiError(403, "Access denied. Insufficient permissions.");
        }
        next();
    };
};
exports.authorize = authorize;
