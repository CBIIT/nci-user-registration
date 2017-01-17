var express = require('express');
var protectedRouter = express.Router();
var uuid = require('node-uuid');
var ldap = require('ldapjs');
var fs = require('fs');
var tlsOptions;

var router = function (logger, config, db, mailer) {

    tlsOptions = {
        ca: [fs.readFileSync(config.ldapproxy.cacert)]
    };


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
                                    '<p>Your previous NCI account ' + userObject.username + ' was linked to your federated account.</p>' +
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
            var userDN = req.get('user_dn').trim().toLowerCase();
            var pubkeyInfo = {};
            pubkeyInfo.key = req.body.pubkey.trim();
            pubkeyInfo.processed = false;

            if (userDN.match(config.ldapproxy.dnTestRegex)) {

                getUser(userDN, logger, config)
                    .then(function (user) {
                        // make sure we have the correct user in LDAP Proxy
                        if (userDN === user.dn) {
                            db.updateSSHPublicKey(userDN, pubkeyInfo, function (err, document) {
                                if (err) {
                                    logger.error('Failed to update public key of user with user_dn: ' + userDN);
                                    res.redirect('/logoff?updateerror=true');
                                } else if (document) {

                                    if (document.matchedCount === 1) {
                                        logger.info('Updated public key for user_dn: ' + userDN);
                                        db.logWithDN(userDN, 'Updated public key: ' + pubkeyInfo.key);
                                        res.redirect('/logoff?updatesuccess=true');
                                    } else if (document.matchedCount === -1) {
                                        logger.error('Failed to update public key of user with user_dn: ' + userDN + '. Modified count == -1');
                                        res.redirect('/logoff?updateerrornf=true');
                                    } else {
                                        logger.error('Failed to update public key of user with user_dn: ' + userDN + '. Modified count != 1');
                                        res.redirect('/logoff?updateerror=true');
                                    }

                                } else {
                                    logger.error('Failed to update public key of user with user_dn: ' + userDN + '; unknown reason.');
                                    res.redirect('/logoff?updateerror=true');
                                }
                            });
                        } else {
                            logger.error('Failed to update SSH key for user with user DN  ' + userDN + ': User not found in LDAP Proxy.');
                            res.redirect('/logoff?updateerrorinc=true');
                        }
                    }).catch((err) => {
                        // LDAP error.
                        logger.error('Failed LDAP lookup of user with user DN ' + userDN + ': during SSH key update attempt. Error: ' + err.message);
                        res.redirect('/logoff?updateerror=true');
                    });
            } else {
                logger.error('Failed to update SSH jey for user with user DN  ' + userDN + ': User DN format invalid.');
                res.redirect('/logoff?updateerrorinc=true');
            }

        });

    protectedRouter.route('/access-request')
        .get(function (req, res) {
            var app = req.query.app;
            var userDN = req.get('smuserdn').toLowerCase().trim();
            var userAuthType = req.get('user_auth_type').toLowerCase();

            if (userDN.match(config.ldapproxy.dnTestRegex)) {

                // Perform LDAP Proxy query to get the user's information display name
                getUser(userDN, logger, config)
                    .then(function (user) {
                        user.type = userAuthType;
                        var displayName = userAuthType === 'federated' ? user['x-nci-displayName'] : user.displayName;

                        res.render('accessRequestForm', {
                            app: app,
                            displayName: displayName
                        });
                    }).catch((err) => {
                        // LDAP error. Continue, but disable request approval until this is resolved.
                        logger.error('Failed LDAP lookup of user with user DN ' + userDN + ': ' + err.message);
                        res.render('accessRequestForm', {
                            app: app,
                            displayName: null
                        });
                    });
            } else {
                logger.warn('User DN ' + userDN + 'invalid. Proceeding with access request without LDAP lookup.');
                res.render('accessRequestForm', {
                    app: app,
                    displayName: null
                });
            }
        });

    protectedRouter.route('/access-request')
        .post(function (req, res) {
            var app = req.body.app.toLowerCase().trim();
            var userDN = req.get('smuserdn').toLowerCase().trim();
            var userAuthType = req.get('user_auth_type').toLowerCase();

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
            var message = '<p>Access was requested for application: <strong>' + app + '</strong></p>' +
                '<p>Request ID: ' + '<a href="' + config.mail.requestApprovalPrefix + '/' + requestId + '">' + requestId + '</a>' + '</p>' +
                '<p>User DN: ' + userDN + '</p>' +
                '<p>Referrer Application: ' + referer + '</p>' +
                '<p>Display Name: ' + userName + '</p>' +
                '<p>Email: ' + email + '</p>' +
                '<p>Access Level: ' + accessLevel + '</p>' +
                '<p>Justification: ' + justification + '</p>';

            if (userDN.match(config.ldapproxy.dnTestRegex)) {
                getUser(userDN, logger, config)
                    .then(function (user) {

                        if (userAuthType === 'federated' && !user['x-nci-alias']) {
                            requestObject.approvalDisabled = true;
                        }

                        db.recordAccessRequest(requestObject, function () {
                            mailer.send(config.mail.request_recipient, subject, message);
                            logger.info('Access request submitted for application: ' + app + ', User DN: ' + userDN + ', access level requested: ' + accessLevel);
                            res.redirect('/logoff?requestconfirmation=true');
                        });

                    }).catch((err) => {
                        // LDAP error. Continue, but disable request approval until this is resolved.
                        logger.error('Failed LDAP lookup of user with user DN ' + userDN + ': ' + err.message);
                        requestObject.approvalDisabled = true;
                        db.recordAccessRequest(requestObject, function () {
                            mailer.send(config.mail.request_recipient, subject, message);
                            logger.info('Access request submitted for application: ' + app + ', User DN: ' + userDN + ', access level requested: ' + accessLevel);
                            res.redirect('/logoff?requestconfirmation=true');
                        });
                    });
            } else {
                logger.warn('User DN ' + userDN + 'invalid. Recording access request without LDAP lookup.');
                requestObject.approvalDisabled = true;
                db.recordAccessRequest(requestObject, function () {
                    mailer.send(config.mail.request_recipient, subject, message);
                    logger.info('Access request submitted for application: ' + app + ', User DN: ' + userDN + ', access level requested: ' + accessLevel);
                    res.redirect('/logoff?requestconfirmation=true');
                });
            }

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

function getUser(userDN, logger, config) {

    return new Promise(function (resolve, reject) {

        logger.info('Looking up user with DN: ' + userDN);
        var user;

        var ldapClient = ldap.createClient({
            url: config.ldapproxy.host,
            tlsOptions: tlsOptions
        });

        var userSearchOptions = {
            scope: 'base',
            attributes: config.ldapproxy.user_attributes,
            sizeLimit: 1
        };

        ldapClient.bind(config.ldapproxy.dn, config.ldapproxy.password, function (err) {
            if (err) {
                logger.error(err);
                ldapClient.unbind();
                reject(Error(err.message));
            }

            ldapClient.search(userDN, userSearchOptions, function (err, ldapRes) {
                if (err) {
                    console.log('error: ' + err.code);
                }
                ldapRes.on('searchEntry', function (entry) {
                    user = entry.object;
                });
                ldapRes.on('searchReference', function () {});
                ldapRes.on('error', function (err) {
                    ldapClient.unbind();
                    if (err.code === 32) {
                        // Object doesn't exist. The user DN is most likely not fully provisioned yet.
                        logger.info('Failed LDAP lookup of user with user DN ' + userDN + '. Continuing with new user object.');
                        resolve({});
                    } else {
                        reject(Error(err.message));
                    }
                });
                ldapRes.on('end', function () {
                    ldapClient.unbind();
                    resolve(user);
                });
            });
        });

    });

}


module.exports = router;