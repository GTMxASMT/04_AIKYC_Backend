import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { Readable } from "stream";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath: string) => {
  try {
    if (!localFilePath) {
      console.error("No file path provided for Cloudinary upload");
      return null;
    } //upload img on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    console.log("Uploaded file URL from cloudinary → ", response?.url);
    fs.unlinkSync(localFilePath); // remove locally saved temporary file
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove locally saved temporary file
    return null;
  }
};

const uploadBufferToCloudinary = async (
  fileBuffer: Buffer,
  filename: string
) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        public_id: filename.split(".")[0], // optional: keep original filename
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    // Convert buffer to stream and pipe into Cloudinary upload_stream
    Readable.from(fileBuffer).pipe(uploadStream);
  });
};
export { uploadOnCloudinary, uploadBufferToCloudinary };
