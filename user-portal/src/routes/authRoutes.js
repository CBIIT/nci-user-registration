var express = require('express');
var authRouter = express.Router();
var uuid = require('node-uuid');
var router = function (logger, config, db, mailer) {

    authRouter.route('/lookup')
        .post(function (req, res) {
            var userObject = {
                email: req.body.email.toLowerCase().trim(),
                username: req.body.username.toLowerCase().trim()
            };
            var sendEmail = true;
            var loginSuccess = true;
            var alreadyRegistered = false;
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
                        sendEmail = false;
                        db.log(userObject, 'Registration requested. Not proceeding: user is either internal or was previously registered.');
                        logger.info('User already registered or internal. cn: ' + userObject.username + ', email: ' + userObject.email);
                    } else {
                        // User hasn't registered. Produce a unique URL for verification'
                        newUUID = uuid.v4();
                        confirmationLink = '<a href="' + config.mail.confirmURLPrefix + '/' + newUUID + '">here</a>';
                        subject = config.mail.subjectPrefix + ' ### Confirm Your New Account';
                        message = '<p>You have successfully applied for a new account at the National Cancer Institute. ' +
                            'You must confirm your e-mail address to proceed with registration. ' +
                            'The link below is a unique confirmation link for your account, and it will expire in xx hours if not clicked.</p>' +
                            '<p>Click ' + confirmationLink + ' to confirm your account. If you are having trouble clicking the link, please copy and paste the following URL into your web browser: </p>' +
                            '<p>' + config.mail.confirmURLPrefix + '/' + newUUID + '</p>' +
                            '<p>If you have any questions please contact the NIH IT Service Desk at 301-496-4357 and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>' +
                            '<p>If you have received this e-mail by accident, you do not need to take any further action.</p>';


                        db.log(userObject, 'Sending registration URL with UUID ' + newUUID);
                        logger.info('Preparing an email with registration URL for cn: ' + userObject.username + ', email: ' + userObject.email);

                        db.updateUUID(userObject, newUUID, function (err) {
                            if (err) {
                                logger.error('UUID could not be updated for cn: ' + userObject.username + ', email: ' + userObject.email);
                                sendEmail = false;
                            }
                        });
                    }
                } else {
                    sendEmail = false;
                    loginSuccess = false;
                    logger.warn('Failed login. email: ' + userObject.email + ', username: ' + userObject.username);
                }
                if (loginSuccess) {
                    if (sendEmail) {
                        mailer.send(req.body.email, subject, message);
                        res.redirect('/auth/logout?mailsent=true&mail=' + req.body.email);
                    } else if (alreadyRegistered) {
                        res.redirect('/auth/logout?prevregistration=true');
                    } else {
                        // Something failed and no email was sent out. Shouldn't be here'
                        logger.error('Something failed and no email was sent to ' + req.body.email);
                        res.render('error', {
                            message: 'An error occurred while registering your account. Please try again later.',
                            bg_class: 'bg-danger'
                        });
                    }
                } else {
                    res.redirect('/auth/logout?notfound=true');
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
            if (req.query.notfound) {
                message = 'User name and email combination not found. Please try again.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.mapped) {
                message = 'Your account was registered successfully. It will take up to 3 hours to transfer all your information.';
            } else if (req.query.previouslymapped) {
                message = '<p>Our records show that you are already registered and do not need to complete this process again. No further information is required from you at this time.</p>' +
                    '<p>If you have questions please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
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
                message = 'Account registration was unsuccessful.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.updateerror) {
                message = 'Public key update was unsuccessful.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.updatesuccess) {
                message = 'Public key update was successful.';
            } else if (req.query.prevregistration) {
                message = 'Your account has already been registered. No further action is required.';
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
                        res.render('jump', {
                            uuid: id
                        });
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