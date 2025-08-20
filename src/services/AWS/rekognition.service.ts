import { Rekognition } from "aws-sdk";
import { config } from "../../config";

export const rekognition = new Rekognition({
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  region: config.aws.region || "ap-south-1",
});
