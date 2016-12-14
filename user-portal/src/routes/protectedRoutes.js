var express = require('express');
var protectedRouter = express.Router();

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

        // do we still have an active session 
        var username = req.session.username;
        var email = req.session.email;
        var uuid = req.params.id;

        var userObject = {
            uuid: uuid,
            username: username,
            email: email
        };

        var sm_userdn = req.get('user_dn').toLowerCase().trim();
        var userAuthType = req.get('user_auth_type').toLowerCase();
        var dnTester = new RegExp(config.edir.dnTestRegex);

        if (!(username && email)) {
            logger.error('Failed to map with uuid' + uuid + '. Registration session expired. userdn: ' + sm_userdn);
            res.redirect('/logoff?mappingerror=true');
        } else if (userAuthType !== 'federated') {
            logger.error('Failed to map with uuid' + uuid + ': sm_userdn ' + sm_userdn + ' is not federated!');
            db.log(userObject, 'Failed to map to sm_userdn ' + sm_userdn + '. sm_userdn is not federated.');
            res.redirect('/logoff/reattempt?notfederated=true&uuid=' + uuid);
        } else if (sm_userdn === '') {
            logger.warn('User account was provisioned, but sm_userdn is empty. User will be advised to attempt mapping in 24 hours.');
            db.log(userObject, 'User attempted registration with empty sm_userdn. Headers: ' + headers);
            mailer.send(config.mail.admin_list, config.mail.subjectPrefix + ' ### Empty sm_userdn registration attempt', 'Headers: ' + headers);
            res.redirect('/logoff?pending=true');
        } else {

            var itrustInfo = {};
            itrustInfo.sm_userdn = sm_userdn;
            itrustInfo.processed = false;

            var validDN = true;

            if (!sm_userdn.match(dnTester)) {
                validDN = false;
                logger.warn('Registration attempted with invalid sm_userdn: ' + sm_userdn + '. Completing registration and setting processing to manual.');
                itrustInfo.processed = 'manual';
            }


            // check if iTrust info was already mapped to another account
            db.isSmUserDnRegistered(itrustInfo, function (err, result) {
                if (err) {
                    logger.error('Failed to map with uuid' + uuid + ': Error while checking for duplicate mapping of sm_userdn ' + sm_userdn);
                    res.redirect('/logoff?mappingerror=true');
                } else if (result === true) {
                    logger.error('Failed to map with uuid' + uuid + ': sm_userdn ' + sm_userdn + ' is already mapped to a different eDir account!');
                    db.log(userObject, 'Failed to map to sm_userdn ' + sm_userdn + '. sm_userdn is already mapped to a different eDir account.');
                    res.redirect('/logoff/reattempt?duplicateregistration=true&uuid=' + uuid);
                } else {
                    db.addMapping(userObject, itrustInfo, function (err) {
                        if (err) {
                            logger.error('Failed to map ' + userObject.username + ' to userdn ' + sm_userdn);
                            res.redirect('/logoff?mappingerror=true');
                        } else {
                            logger.info('Mapped ' + userObject.username + ' to userdn ' + sm_userdn);

                            if (validDN) {
                                logger.info('Praparing successful resistration email to ' + userObject.username);
                                db.log(userObject, 'Mapped to sm_userdn ' + sm_userdn);
                                var subject = config.mail.subjectPrefix + ' ### Your account was registered';
                                var message = '<p>Your account was registered successfully.</p>' +
                                    '<p>The NCI account ' + userObject.username + ' was linked to your new NIH External account.</p>' +
                                    '<p>It will take up to 3 hours to complete the transfer of all your account information.</p>';
                                mailer.send(userObject.email, subject, message);
                                res.redirect('/logoff?mapped=true');
                            } else {

                                db.log(userObject, 'Mapped to sm_userdn ' + sm_userdn + ', which is and invalid DN. Record was flagged for manual processing. Headers: ' + headers);
                                mailer.send(config.mail.admin_list, config.mail.subjectPrefix + ' ### Registration with invalid sm_userdn', 'Headers: ' + headers);
                                res.redirect('/logoff?invaliddn=true');
                            }
                        }
                    });
                }
            });
        }
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
            var smUserDN = req.get('user_dn').toLowerCase();

            db.updateSSHPublicKey(smUserDN, pubkeyInfo, function (err, document) {
                if (err) {
                    logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN);
                    res.redirect('/logoff?updateerror=true');
                } else if (document) {

                    if (document.matchedCount === 1) {
                        logger.info('Updated public key for sm_userdn: ' + smUserDN);
                        db.logWithDN(smUserDN, 'Updated public key: ' + pubkeyInfo.key);
                        res.redirect('/logoff?updatesuccess=true');
                    } else if (document.matchedCount === -1) {
                        logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN + '. Modified count == -1');
                        res.redirect('/logoff?updateerrornf=true');
                    } else {
                        logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN + '. Modified count != 1');
                        res.redirect('/logoff?updateerror=true');
                    }

                } else {
                    logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN + '; unknown reason.');
                    res.redirect('/logoff?updateerror=true');
                }
            });

        });


    return protectedRouter;
};

function getHeaders(headers) {
    var result = '';
    headers.forEach(function (item) {
        result += headers[item] + '\n';
    });
}

module.exports = router;