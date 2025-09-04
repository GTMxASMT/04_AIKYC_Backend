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
  iat?: number;
  exp?: number;
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
    let token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    // Also check cookies if no header token
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new ApiError(401, "Access denied. No token provided.");
    }

    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

      if (!decoded || !decoded.id) {
        throw new ApiError(401, "Invalid token. Authentication failed.");
      }
      // Check token expiration manually for better error handling
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new ApiError(401, "Token expired. Please refresh your token.");
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: decoded.id, isActive: true },
        select: [
          "id",
          "name",
          "email",
          "role",
          "isActive",
          "profileImage",
          "phone",
          "createdAt",
          "updatedAt",
        ],
      });

      if (!user) {
        console.log("User not found for token:", { userId: decoded.id });
        throw new ApiError(401, "Invalid token. User not found.");
      }

      req.user = user;
      console.log("User authenticated successfully:", {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
      });

      next();
    } catch (error) {
      console.error("Authentication error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        tokenProvided: !!token,
        endpoint: req.path,
      });

      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, "Token expired. Please refresh your token.");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, "Invalid token. Authentication failed.");
      } else if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(500, "Authentication service error");
    }
  }
);

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      console.log("Authorization failed:", {
        userRole: req.user.role,
        requiredRoles: roles,
        endpoint: req.path,
      });
      throw new ApiError(403, "Access denied. Insufficient permissions.");
    }

    next();
  };
};

export const autoRefreshToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const token =
      req.header("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.accessSecret, {
          ignoreExpiration: true,
        }) as JwtPayload;

        // Check if token expires within 5 minutes
        if (decoded.exp && decoded.exp * 1000 - Date.now() < 5 * 60 * 1000) {
          console.log("Token expires soon, should refresh");
          // You could set a header to inform frontend to refresh
          res.setHeader("X-Token-Refresh-Needed", "true");
        }
      } catch (error) {
        console.error("refreshToken verification error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          tokenProvided: !!token,
          endpoint: req.path,
        });
      }
    }

    next();
  }
);
