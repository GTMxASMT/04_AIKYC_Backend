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
exports.s3Service = void 0;
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const config_1 = require("../config");
const ApiError_1 = require("../utilities/ApiError");
class S3Service {
    constructor() {
        // Configure AWS
        aws_sdk_1.default.config.update({
            accessKeyId: config_1.config.aws.accessKeyId,
            secretAccessKey: config_1.config.aws.secretAccessKey,
            region: config_1.config.aws.region,
        });
        this.s3 = new aws_sdk_1.default.S3();
    }
    uploadFile(file_1) {
        return __awaiter(this, arguments, void 0, function* (file, folder = "profile-images") {
            try {
                // Generate unique filename
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 15);
                const fileExtension = file.originalname.split(".").pop();
                const fileName = `${folder}/${timestamp}-${randomString}.${fileExtension}`;
                const uploadParams = {
                    Bucket: config_1.config.aws.s3BucketName,
                    Key: fileName,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                    ACL: "public-read",
                    Metadata: {
                        "original-name": file.originalname,
                    },
                };
                const result = yield this.s3.upload(uploadParams).promise();
                return result.Location;
            }
            catch (error) {
                console.error("S3 Upload Error:", error);
                throw new ApiError_1.ApiError(500, "Failed to upload file to S3");
            }
        });
    }
    deleteFile(fileUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Extract key from URL
                const urlParts = fileUrl.split("/");
                const key = urlParts.slice(-2).join("/"); // Get folder/filename
                const deleteParams = {
                    Bucket: config_1.config.aws.s3BucketName,
                    Key: key,
                };
                yield this.s3.deleteObject(deleteParams).promise();
            }
            catch (error) {
                console.error("S3 Delete Error:", error);
                throw new ApiError_1.ApiError(500, "Failed to delete file from S3");
            }
        });
    }
}
exports.s3Service = new S3Service();
