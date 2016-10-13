var express = require('express');
var protectedRouter = express.Router();

var router = function (logger, db) {

    protectedRouter.route('/map/:id')

    .get(function (req, res) {
        logger.info('authenticated by iTrust');

        var sm_userdn = req.get('smuserdn').toLowerCase();

        var itrustInfo = {};
        itrustInfo.sm_userdn = sm_userdn;
        itrustInfo.updated = true;

        var userObject = {
            uuid: req.params.id,
            username: req.session.username,
            email: req.session.email
        };

        db.addMapping(userObject, itrustInfo, function (err) {
            if (err) {
                logger.error('Failed to map ' + userObject.username + ' to userdn ' + sm_userdn);
                res.redirect('/auth/logout?mappingerror=true');
            } else {
                logger.info('Mapped ' + userObject.username + ' to userdn ' + sm_userdn);
                db.log(userObject, 'Mapped to sm_userdn ' + sm_userdn);
                res.redirect('/auth/logout?mapped=true');
            }
        });
    });

    protectedRouter.route('/update')

    .get(function (req, res) {
        res.render('updateForm');
    });

    protectedRouter.route('/update')
        .post(function (req, res) {
            var pubkeyInfo = {};
            pubkeyInfo.key = req.body.pubkey.trim();
            pubkeyInfo.updated = true;
            var smUserDN = req.get('smuserdn').toLowerCase();

            db.updateSSHPublicKey(smUserDN, pubkeyInfo, function (err, document) {
                if (err) {
                    logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN);
                    res.redirect('/auth/logout?updateerror=true');
                } else if (document) {

                    if (document.modifiedCount === 1) {
                        logger.info('Updated public key for sm_userdn: ' + smUserDN);
                        db.logWithDN(smUserDN, 'Updated public key: ' + pubkeyInfo.key);
                        res.redirect('/auth/logout?updatesuccess=true');
                    } else {
                        logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN + '. Modified count != 1');
                        res.redirect('/auth/logout?updateerror=true');
                    }

                }
            });

        });


    return protectedRouter;
};

module.exports = router;