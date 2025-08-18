import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/db";
import { User } from "../entities/User.entity";
import { ApiError } from "../utilities/ApiError";
import { asyncHandler } from "../utilities/AsyncHandler";
import { config, UserRole } from "../config";

interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const authenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    let token = req.header("Authorization")?.replace("Bearer ", "");

    // Also check cookies if no header token
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new ApiError(401, "Access denied. No token provided.");
    }

    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: decoded.id, isActive: true },
      });

      if (!user) {
        throw new ApiError(401, "Invalid token. User not found.");
      }

      req.user = user;
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, "Invalid token.");
      }
      throw error;
    }
  }
);

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "Access denied. Insufficient permissions.");
    }

    next();
  };
};
