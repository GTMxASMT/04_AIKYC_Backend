import { config } from "../config";
import { User } from "../entities/User.entity";
import jwt from "jsonwebtoken";

function generateTokens(user: User) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, config.jwt.accessSecret as any, {
    expiresIn: config.jwt.accessExpiresIn as any,
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret as any, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });

  return { accessToken, refreshToken };
}

export default generateTokens;
