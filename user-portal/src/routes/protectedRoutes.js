var express = require('express');
var protectedRouter = express.Router();

var router = function (logger, config, db, mailer) {

    protectedRouter.route('/map/:id')

    .get(function (req, res) {
        logger.info('authenticated by iTrust');

        // do we still have an active session 
        var username = req.session.username;
        var email = req.session.email;
        var uuid = req.params.id;

        var userObject = {
            uuid: uuid,
            username: username,
            email: email
        };

        var sm_userdn = req.get('smuserdn').toLowerCase();
        var userAuthType = req.get('user_auth_type').toLowerCase();

        if (!(username && email)) {
            logger.error('Failed to map with uuid' + uuid + '. Registration session expired. userdn: ' + sm_userdn);
            res.redirect('/logoff?mappingerror=true');
        } else if (!sm_userdn) {
            logger.error('Failed to map with uuid' + uuid + ': sm_userdn undefined!');
            res.redirect('/logoff?mappingerror=true');
        } else if (userAuthType !== 'federated') {
            logger.error('Failed to map with uuid' + uuid + ': sm_userdn ' + sm_userdn + ' is not federated!');
            db.log(userObject, 'Failed to map to sm_userdn ' + sm_userdn + '. sm_userdn is not federated.');
            res.redirect('/logoff/reattempt?notfederated=true&uuid=' + uuid);
        } else {

            var itrustInfo = {};
            itrustInfo.sm_userdn = sm_userdn;
            itrustInfo.processed = false;

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
                            logger.info('Praparing successful resistration email to ' + userObject.username);
                            db.log(userObject, 'Mapped to sm_userdn ' + sm_userdn);
                            var subject = config.mail.subjectPrefix + ' ### Your account was registered';
                            var message = '<p>Your account was registered successfully.</p>' +
                                '<p>The NCI account ' + userObject.username + ' was linked to your new NIH External account.</p>' +
                                '<p>It will take up to 3 hours to complete the transfer of all your account information.</p>';
                            mailer.send(userObject.email, subject, message);

                            res.redirect('/logoff?mapped=true');
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
            var smUserDN = req.get('smuserdn').toLowerCase();

            db.updateSSHPublicKey(smUserDN, pubkeyInfo, function (err, document) {
                if (err) {
                    logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN);
                    res.redirect('/logoff?updateerror=true');
                } else if (document) {

                    if (document.matchedCount === 1) {
                        logger.info('Updated public key for sm_userdn: ' + smUserDN);
                        db.logWithDN(smUserDN, 'Updated public key: ' + pubkeyInfo.key);
                        res.redirect('/logoff?updatesuccess=true');
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

module.exports = router;