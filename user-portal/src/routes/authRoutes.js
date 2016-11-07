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

                    db.log(userObject, 'Login with username and email');

                    var newUUID, confirmationLink;

                    if ((document.groupMembership.indexOf(config.edir.externalGroup) < 0) || document.itrustinfo) {
                        // user has previously registered. Notify user that no further action is needed.
                        alreadyRegistered = true;
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
                        res.redirect('/logoff?mailsent=true&mail=' + req.body.email);
                    } else if (alreadyRegistered) {
                        res.redirect('/logoff?prevregistration=true');
                    } else {
                        // Something failed and no email was sent out. Shouldn't be here'
                        logger.error('Something failed and no email was sent to ' + req.body.email);
                        res.render('error', {
                            message: 'An error occurred while registering your account. Please try again later.',
                            bg_class: 'bg-danger'
                        });
                    }
                } else {
                    res.redirect('/logoff?notfound=true');
                }
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
                        res.redirect('/logoff?exp=true');
                    } else if (document.itrustinfo) {
                        logger.info('User with uuid ' + id + ' and email ' + document.mail + ' already mapped.');
                        db.log(userObject, 'UUID confirmed. User already mapped: Not proceeding with user mapping');
                        res.redirect('/logoff?previouslymapped=true');
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
                    res.redirect('/logoff?invalid=true');
                }

            });

        });

    return authRouter;
};

module.exports = router;