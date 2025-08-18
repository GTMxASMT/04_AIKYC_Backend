import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToClass, plainToInstance } from "class-transformer";
import { ApiError } from "../utilities/ApiError";

export const validateDTO = (dtoClass: any) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToInstance(dtoClass, req.body);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const errorMessages = errors.map((error) => ({
          field: error.property,
          messages: Object.values(error.constraints || {}),
        }));

        throw new ApiError(400, "Validation failed", errorMessages);
      }

      req.body = dto;
      next();
    } catch (error) {
      next(error);
    }
  };
};
