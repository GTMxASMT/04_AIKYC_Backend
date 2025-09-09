import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../../config";

export const s3Client = new S3Client({
  region: config.aws.region || "ap-south-1",
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

export class S3Service {
  private s3: S3Client;

  constructor() {
    this.s3 = s3Client;
  }

  async fetchImageFromS3(bucket: string, key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(command);
      const chunks: Buffer[] = [];

      for await (const chunk of response.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (err) {
      console.error("Error fetching from S3:", err);
      throw err;
    }
  }
}
