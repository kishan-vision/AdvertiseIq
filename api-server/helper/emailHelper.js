const emailConfig = require("../../config/emailConfig");
const nodemailer = require("nodemailer");

const sendEmailHelper = (to, subject, html) => {
  return new Promise(function (resolve, reject) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailConfig.email.user,
        pass: emailConfig.email.pass,
      },
    });

    let mailOptions = {
      from: emailConfig.email.user,
      to: to,
      subject: subject + " - " + emailConfig.email.adminEmail,
      html: html,
    };

    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        resolve({ delivered: false, status: "Fail", error: error });
      } else {
        resolve({ delivered: true, status: "Success", info: info });
      }
    });
  });
};

module.exports = { sendEmailHelper };
