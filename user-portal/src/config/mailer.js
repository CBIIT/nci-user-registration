var mailer = require('nodemailer');

var loggerRef;
var smtpConfig = {};
var transporter;
var defaultFromAddress;

module.exports = {
    init: function (logger, config, cb) {
        loggerRef = logger;
        smtpConfig.host = config.mail.host;
        smtpConfig.secure = config.mail.smtp_starttls_enable;
        defaultFromAddress = config.mail.defaultFromAddress;
        transporter = mailer.createTransport(smtpConfig);
        cb();
    },

    send: function (recipient, subject, message) {

        var mailOptions = {
            from: defaultFromAddress,
            to: recipient,
            subject: subject,
            html: message
        };

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                loggerRef.error(error);
            }
            loggerRef.info(info);
        });
    }
};