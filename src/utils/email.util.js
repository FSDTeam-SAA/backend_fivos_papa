import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_EMAIL_PASS,
  },
});

export const sendMail = async (email, subject, text, html) => {
  try {
    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
};

export const sendOTP = async (email, otp) => {
  return sendMail(
    email,
    "Password Reset OTP",
    `Your OTP is: ${otp}`,
    `<p>Your OTP is: <strong>${otp}</strong></p>`,
  );
};

export const sendContactReply = async (email, name, replyMessage) => {
  return sendMail(
    email,
    "Reply to your contact us submission",
    `Dear ${name},\n\nThank you for contacting us. Here is our response:\n\n${replyMessage}\n\nBest regards,\nThe Support Team`,
    `<p>Dear ${name},</p>
     <p>Thank you for contacting us. Here is our response:</p>
     <p>${replyMessage}</p>
     <p>Best regards,<br/>The Support Team</p>`,
  );
};

export default transporter;
