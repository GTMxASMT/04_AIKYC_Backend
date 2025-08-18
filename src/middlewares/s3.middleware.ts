import AWS from "aws-sdk";
import { config } from "../config";
import { ApiError } from "../utilities/ApiError";

class S3Service {
  private s3: AWS.S3;

  constructor() {
    // Configure AWS
    AWS.config.update({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region,
    });

    this.s3 = new AWS.S3();
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = "profile-images"
  ): Promise<string> {
    try {
      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = file.originalname.split(".").pop();
      const fileName = `${folder}/${timestamp}-${randomString}.${fileExtension}`;

      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: config.aws.s3BucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
        Metadata: {
          "original-name": file.originalname,
        },
      };

      const result = await this.s3.upload(uploadParams).promise();
      return result.Location;
    } catch (error) {
      console.error("S3 Upload Error:", error);
      throw new ApiError(500, "Failed to upload file to S3");
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract key from URL
      const urlParts = fileUrl.split("/");
      const key = urlParts.slice(-2).join("/"); // Get folder/filename

      const deleteParams: AWS.S3.DeleteObjectRequest = {
        Bucket: config.aws.s3BucketName,
        Key: key,
      };

      await this.s3.deleteObject(deleteParams).promise();
    } catch (error) {
      console.error("S3 Delete Error:", error);
      throw new ApiError(500, "Failed to delete file from S3");
    }
  }
}

export const s3Service = new S3Service();
