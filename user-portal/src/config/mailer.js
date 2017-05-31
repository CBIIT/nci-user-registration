var mailer = require('nodemailer');

var loggerRef;
var smtpConfig = {};
var transporter;
var defaultFromAddress;

module.exports = {
    init: function (logger, config, cb) {
        loggerRef = logger;
        smtpConfig.host = config.mail.host;
        smtpConfig.port = config.mail.port;
        smtpConfig.secure = config.mail.secure;
        smtpConfig.ignoreTLS = config.mail.ignoreTLS;
        defaultFromAddress = config.mail.defaultFromAddress;
        transporter = mailer.createTransport(smtpConfig);
        cb();
    },

    send: function (recipient, subject, message) {

        var mailOptions = {
            from: defaultFromAddress,
            replyTo: defaultFromAddress,
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