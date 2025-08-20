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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDTO = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const ApiError_1 = require("../utilities/ApiError");
const validateDTO = (dtoClass) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const dto = (0, class_transformer_1.plainToInstance)(dtoClass, req.body);
            const errors = yield (0, class_validator_1.validate)(dto);
            if (errors.length > 0) {
                const errorMessages = errors.map((error) => ({
                    field: error.property,
                    messages: Object.values(error.constraints || {}),
                }));
                throw new ApiError_1.ApiError(400, "Validation failed", errorMessages);
            }
            req.body = dto;
            next();
        }
        catch (error) {
            next(error);
        }
    });
};
exports.validateDTO = validateDTO;
