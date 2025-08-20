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
exports.uploadBufferToCloudinary = exports.uploadOnCloudinary = void 0;
const cloudinary_1 = require("cloudinary");
const fs_1 = __importDefault(require("fs"));
const stream_1 = require("stream");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const uploadOnCloudinary = (localFilePath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!localFilePath) {
            console.error("No file path provided for Cloudinary upload");
            return null;
        } //upload img on cloudinary
        const response = yield cloudinary_1.v2.uploader.upload(localFilePath, {
            resource_type: "auto",
        });
        console.log("Uploaded file URL from cloudinary → ", response === null || response === void 0 ? void 0 : response.url);
        fs_1.default.unlinkSync(localFilePath); // remove locally saved temporary file
        return response;
    }
    catch (error) {
        fs_1.default.unlinkSync(localFilePath); // remove locally saved temporary file
        return null;
    }
});
exports.uploadOnCloudinary = uploadOnCloudinary;
const uploadBufferToCloudinary = (fileBuffer, filename) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_1.v2.uploader.upload_stream({
            resource_type: "image",
            public_id: filename.split(".")[0], // optional: keep original filename
        }, (error, result) => {
            if (error)
                return reject(error);
            resolve(result);
        });
        // Convert buffer to stream and pipe into Cloudinary upload_stream
        stream_1.Readable.from(fileBuffer).pipe(uploadStream);
    });
});
exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
