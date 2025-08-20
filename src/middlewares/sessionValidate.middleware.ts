import { Request, Response, NextFunction } from "express";

export const validateSessionId = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionId = req.params.id;
  if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
    return res.status(400).json({ error: "Invalid session ID" });
  }
  next();
};
