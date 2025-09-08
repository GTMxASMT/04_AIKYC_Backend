import { ApiError } from "./ApiError";

async function verifyCaptcha(token: string): Promise<boolean> {
  const secretKey = process.env.GOOGLE_RECAPTCHA_SECRET_KEY;

  let data;
  try {
    if (!token) {
      console.log("No token");
      throw new ApiError(400, "No token found");
    }
    const response = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`,
      {
        method: "POST",
      }
    );

    data = await response.json();
    console.log(data);

    if (!data) {
      console.error("Data not found");
    }
  } catch (e: any) {
    console.error("Failed ccaptcha . ", e.message);
    throw new ApiError(400, "Captcha verification failed");
  }

  return data.success;
}

export default verifyCaptcha;
