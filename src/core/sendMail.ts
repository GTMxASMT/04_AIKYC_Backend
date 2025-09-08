import nodemailer from "nodemailer";

export async function sendMail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // use TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: `eKYC`,
    to,
    subject,
    html: body,
  });
  if (info.messageId) {
    console.log(
      "Mail sent: %s",
      info.messageId,
      "\nfrom :\t",
      process.env.EMAIL_USER,
      "\nto\t: ",
      to
    );
    return true;
  } else {
    return false;
  }
}
