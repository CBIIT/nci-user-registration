var express = require('express');
var authRouter = express.Router();

var uuid = require('node-uuid');
var mailer = require('nodemailer');

var router = function (logger, config, db) {
    var smtpConfig = {};
    smtpConfig.host = config.mail.host;
    smtpConfig.secure = config.mail.smtp_starttls_enable;
    var transporter = mailer.createTransport(smtpConfig);


    authRouter.route('/lookup')
        .post(function (req, res) {
            var userObject = {
                email: req.body.email.toLowerCase().trim(),
                username: req.body.username.toLowerCase().trim()
            };
            var sendEmail = true;
            var subject, message;

            db.findUserByEmailAndCn(userObject, function (err, document) {
                if (document) {
                    req.session.email = userObject.email;
                    req.session.username = userObject.username;

                    db.log(userObject, 'Login with username and email');

                    var newUUID, confirmationLink;

                    // if ((document.groupMembership.indexOf(config.edir.externalGroup) < 0) || document.itrustinfo) {
                    if (document.itrustinfo) {
                        // user has previously registered. Notify user that no further action is needed.
                        db.log(userObject, 'Registration requested. Not proceeding: user is either internal or was previously registered.');
                        logger.info('User is an internal user or was previously registered. cn: ' + userObject.username + ', email: ' + userObject.email);
                        subject = config.mail.subjectPrefix + ' ### Thanks for submitting your information.';
                        message = 'Your account has already been registered. No further action is required.';
                    } else {
                        // User hasn't registered. Produce a unique URL for verification'
                        newUUID = uuid.v4();
                        confirmationLink = '<a href="' + config.mail.confirmURLPrefix + '/' + newUUID + '">here</a>';
                        subject = config.mail.subjectPrefix + ' ### Confirm your account';
                        message = 'Click ' + confirmationLink + ' to confirm your account.';
                        db.log(userObject, 'Sending registration URL with UUID ' + newUUID);
                        logger.info('Sending registration URL to cn: ' + userObject.username + ', email: ' + userObject.email);

                        db.updateUUID(userObject, newUUID, function (err) {
                            if (err) {
                                sendEmail = false;
                            }
                        });
                    }

                } else {
                    logger.warn('Failed login. email: ' + userObject.email + ', username: ' + userObject.username);
                    subject = config.mail.subjectPrefix + ' ### Thanks for submitting your information.';
                    message = '<p>A NCI registration request was submitted for this email account. Unfortunately, the user name and email combination could not be found.</p>' +
                        '<p>If you need assistance please contact NCI help desk at helpdesk@nci.nih.gov or call 555-555-5555.</p>' +
                        '<p>If you want to re-attempt registration please click <a href="' + config.web.protocol + '://' + config.web.host + ':' + config.web.port + '">here</a> to return to the registration page.</p>';
                }

                var mailOptions = {
                    from: config.mail.defaultFromAddress,
                    to: req.body.email,
                    subject: subject,
                    html: message
                };

                if (sendEmail) {
                    transporter.sendMail(mailOptions, function (error, info) {
                        if (error) {
                            logger.error(error);
                        }
                        logger.info(info);
                    });
                }


                if (sendEmail) {
                    res.redirect('/auth/logout?mailsent=true&mail=' + req.body.email);
                } else {
                    // Something failed and no email was sent out
                    res.render('error', {
                        message: 'An error occurred while registering your account. Please try again later.',
                        bg_class: 'bg-error'
                    });
                }
            });
        });

    authRouter.route('/logout')
        .get(function (req, res) {
            req.session.destroy(function (err) {
                if (err) {
                    logger.error('Failed to destroy session: ' + err);
                }
            });
            var message = 'Thanks and Goodbye.';
            var bg_class = 'bg-success';
            if (req.query.mapped) {
                message = 'Your account was registered successfully. It will take up to 3 hours to transfer all your information.';
            } else if (req.query.previouslymapped) {
                message = 'Your account has already been registered. No further action is required.';
            } else if (req.query.mailsent) {
                message = 'An email was sent to ' + req.query.mail +
                    '. Please check your email and follow the instructions to register your account.';
            } else if (req.query.exp) {
                message = 'The confirmation URL has expired. Please go back to the main page and submit your information to receive a new confirmation link.';
                bg_class = 'bg-warning';
            } else if (req.query.invalid) {
                message = 'The confirmation URL is invalid. Please go back to the main page and submit your information to receive a new confirmation link.';
                bg_class = 'bg-warning';
            } else if (req.query.mappingerror) {
                message = 'Account registration was unsuccessful. Please contact NCI Help Desk at helpdesk@nci.nih.gov or call 555-555-5555.';
                bg_class = 'bg-error';
            } else if (req.query.updateerror) {
                message = 'Public key update was unsuccessful. Please contact NCI Help Desk at helpdesk@nci.nih.gov or call 555-555-5555.';
                bg_class = 'bg-error';
            } else if (req.query.updatesuccess) {
                message = 'Public key update was successful.';
            }

            res.render('logout', {
                message: message,
                bg_class: bg_class
            });
        });

    authRouter.route('/confirm/:id')
        .get(function (req, res) {
            var id = req.params.id;

            // find the user with the uuid in the db
            db.confirmUUID(id, function (err, document, expired) {
                if (err) {
                    logger.error(err);
                    res.send('error while retrieving UUID');
                }
                if (document) {
                    var userObject = {
                        email: document.mail,
                        username: document.extracted_dn_username
                    };
                    // UUID confirmed.                    
                    logger.info('UUID confirmed: ' + id);
                    if (expired) {
                        logger.info('UUID ' + id + ' sent for conirmation. UUID found, but it has expired!');
                        db.log(userObject, 'UUID confirmed. UUID has expired: Not proceeding with user mapping');
                        res.redirect('/auth/logout?exp=true');
                    } else if (document.itrustinfo) {
                        logger.info('User with uuid ' + id + ' and email ' + document.mail + ' already mapped.');
                        db.log(userObject, 'UUID confirmed. User already mapped: Not proceeding with user mapping');
                        res.redirect('/auth/logout?previouslymapped=true');
                    } else {
                        req.session.email = document.mail;
                        req.session.username = document.extracted_dn_username;
                        db.log(userObject, 'UUID confirmed. Proceeding with user mapping.');
                        res.redirect('/protected/itrust/map/' + id);
                    }
                } else {
                    logger.warn('UUID ' + id + ' sent for confirmation. No document found!');
                    res.redirect('/auth/logout?invalid=true');
                }

            });

        });

    return authRouter;
};

module.exports = router;