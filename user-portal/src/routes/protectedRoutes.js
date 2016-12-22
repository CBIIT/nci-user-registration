var express = require('express');
var protectedRouter = express.Router();
var uuid = require('node-uuid');

var router = function (logger, config, db, mailer) {

    protectedRouter.route('/whoami')
        .get(function (req, res) {
            res.send(req.get('user_dn'));
        });

    protectedRouter.route('/headers')
        .get(function (req, res) {
            res.send(getHeaders(req.headers));
        });


    protectedRouter.route('/map/:id')

    .get(function (req, res) {
        logger.info('authenticated by iTrust');

        var headers = getHeaders(req.headers);

        var user_dn = req.get('user_dn').toLowerCase().trim();
        var userAuthType = req.get('user_auth_type').toLowerCase();
        // do we still have an active session 
        var username = req.session.username;
        var email = req.session.email;
        var uuid = req.params.id;

        var userObject = {
            uuid: uuid,
            username: username,
            email: email
        };

        var dnTester = new RegExp(config.edir.dnTestRegex);

        var itrustInfo = {};

        if (!(username && email)) {
            logger.error('Failed to map with uuid' + uuid + '. Registration session expired. userdn: ' + user_dn);
            res.redirect('/logoff?mappingerror=true');
        } else if (userAuthType !== 'federated') {
            logger.error('Failed to map with uuid' + uuid + ': user_dn ' + user_dn + ' is not federated!');
            db.log(userObject, 'Failed to map to user_dn ' + user_dn + '. user_dn is not federated.');
            res.redirect('/logoff/reattempt?notfederated=true&uuid=' + uuid);
        } else if (user_dn === '') {
            logger.warn('User account was provisioned, but user_dn is empty. itrustinfo will be set to pending until user_dn becomes available.');
            db.log(userObject, 'User attempted registration with empty user_dn. Headers: ' + headers);
            mailer.send(config.mail.admin_list, config.mail.subjectPrefix + ' ### Empty user_dn registration attempt', 'Headers: ' + headers);

            itrustInfo.processed = 'pending';

            db.addMapping(userObject, itrustInfo, function (err) {
                res.redirect('/logoff?pending=true');
            });

        } else {


            itrustInfo.sm_userdn = user_dn;
            itrustInfo.processed = false;

            var validDN = true;

            if (!user_dn.match(dnTester)) {
                validDN = false;
                logger.warn('Registration attempted with invalid user_dn: ' + user_dn + '. Completing registration and setting processing to manual.');
                itrustInfo.processed = 'manual';
            }

            // check if iTrust info was already mapped to another account
            db.isSmUserDnRegistered(itrustInfo, function (err, result) {
                if (err) {
                    logger.error('Failed to map with uuid' + uuid + ': Error while checking for duplicate mapping of user_dn ' + user_dn);
                    res.redirect('/logoff?mappingerror=true');
                } else if (result === true) {
                    logger.error('Failed to map with uuid' + uuid + ': user_dn ' + user_dn + ' is already mapped to a different eDir account!');
                    db.log(userObject, 'Failed to map to user_dn ' + user_dn + '. user_dn is already mapped to a different eDir account.');
                    res.redirect('/logoff/reattempt?duplicateregistration=true&uuid=' + uuid);
                } else {
                    db.addMapping(userObject, itrustInfo, function (err) {
                        if (err) {
                            logger.error('Failed to map ' + userObject.username + ' to user_dn ' + user_dn);
                            res.redirect('/logoff?mappingerror=true');
                        } else {
                            logger.info('Mapped ' + userObject.username + ' to user_dn ' + user_dn);

                            if (validDN) {
                                logger.info('Praparing successful resistration email to ' + userObject.username);
                                db.log(userObject, 'Mapped to user_dn ' + user_dn);
                                var subject = config.mail.subjectPrefix + ' ### Your account was registered';
                                var message = '<p>Your account was registered successfully.</p>' +
                                    '<p>The NCI account ' + userObject.username + ' was linked to your new NIH External account.</p>' +
                                    '<p>It will take up to one business day to complete the transfer of all your account information.</p>';
                                mailer.send(userObject.email, subject, message);
                                res.redirect('/logoff?mapped=true');
                            } else {
                                db.log(userObject, 'Mapped to user_dn ' + user_dn + ', which is an invalid DN. Record was flagged for manual processing. Headers: ' + headers);
                                mailer.send(config.mail.admin_list, config.mail.subjectPrefix + ' ### Registration with invalid user_dn', 'Headers: ' + headers);
                                res.redirect('/logoff?invaliddn=true');
                            }
                        }
                    });
                }
            });
        }
    });

    protectedRouter.route('/myaccount')
        .get(function (req, res) {
            res.render('myaccount');
        });


    protectedRouter.route('/update')
        .get(function (req, res) {
            res.render('updateForm');
        });

    protectedRouter.route('/update')
        .post(function (req, res) {
            var pubkeyInfo = {};
            pubkeyInfo.key = req.body.pubkey.trim();
            pubkeyInfo.processed = false;
            var user_dn = req.get('user_dn').toLowerCase();

            db.updateSSHPublicKey(user_dn, pubkeyInfo, function (err, document) {
                if (err) {
                    logger.error('Failed to update public key of user with user_dn: ' + user_dn);
                    res.redirect('/logoff?updateerror=true');
                } else if (document) {

                    if (document.matchedCount === 1) {
                        logger.info('Updated public key for user_dn: ' + user_dn);
                        db.logWithDN(user_dn, 'Updated public key: ' + pubkeyInfo.key);
                        res.redirect('/logoff?updatesuccess=true');
                    } else if (document.matchedCount === -1) {
                        logger.error('Failed to update public key of user with user_dn: ' + user_dn + '. Modified count == -1');
                        res.redirect('/logoff?updateerrornf=true');
                    } else {
                        logger.error('Failed to update public key of user with user_dn: ' + user_dn + '. Modified count != 1');
                        res.redirect('/logoff?updateerror=true');
                    }

                } else {
                    logger.error('Failed to update public key of user with user_dn: ' + user_dn + '; unknown reason.');
                    res.redirect('/logoff?updateerror=true');
                }
            });

        });

    protectedRouter.route('/access-request')
        .get(function (req, res) {
            var app = req.query.app;
            res.render('accessRequestForm', {
                app: app
            });
        });

    protectedRouter.route('/access-request')
        .post(function (req, res) {
            var app = req.body.app.toLowerCase().trim();
            var userDN = req.get('smuserdn').toLowerCase().trim();
            var referer = req.body.referer;
            var userName = (req.get('user_firstname') + ' ' + req.get('user_lastname')).trim();
            var email = req.get('user_email').trim();

            var accessLevel = req.body.acclevel;
            var justification = req.body.justification.trim();

            // record request and send email
            var requestObject = {};
            var requestId = uuid.v4();
            requestObject.request_id = requestId;
            requestObject.requested_app = app;
            requestObject.user_dn = userDN;
            requestObject.referer = referer;
            requestObject.user_name = userName;
            requestObject.email = email;
            requestObject.requested_access_level = accessLevel;
            requestObject.justification = justification;
            requestObject.approval = 'unknown';

            var subject = config.mail.subjectPrefix + ' NCI Application Access Request ';
            var message = '<p>Access was requested for application: ' + app + '</p>' +
                '<p>Request ID: ' + '<a href="' + config.mail.requestApprovalPrefix + '/' + requestId + '">' + requestId + '</a>' + '</p>' +
                '<p>User DN: ' + userDN + '</p>' +
                '<p>Referrer Application: ' + referer + '</p>' +
                '<p>Display Name: ' + userName + '</p>' +
                '<p>Email: ' + email + '</p>' +
                '<p>Access Level: ' + accessLevel + '</p>' +
                '<p>Justification: ' + justification + '</p>';

            db.recordAccessRequest(requestObject, function (err, result) {
                mailer.send(config.mail.request_recipient, subject, message);
                logger.info('Access request submitted for application: ' + app + ', User DN: ' + userDN + ', access level requested: ' + accessLevel);
            });

            res.redirect('/logoff?requestconfirmation=true');

        });

    return protectedRouter;
};

function getHeaders(headers) {
    var result = '';
    for (var item in headers) {
        result += item + ': ' + headers[item] + '<br>';
    }

    return result;

}

module.exports = router;