import nodemailer from "nodemailer";

const sendEmail = async ({ to, subject, htmlContent }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: `"ShifaClick" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully: ", info.messageId);
    return { success: true };
  } catch (error) {
    console.error("Nodemailer Error: ", error);
    return { success: false, error: error.message };
  }
};

export default sendEmail;
