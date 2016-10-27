var express = require('express');
var openItrustRouter = express.Router();

var router = function (logger, config, db) {

    openItrustRouter.route('/update')

    .get(function (req, res) {
        res.render('updateForm');
    });

    openItrustRouter.route('/update')
        .post(function (req, res) {
            var pubkeyInfo = {};
            pubkeyInfo.key = req.body.pubkey.trim();
            pubkeyInfo.processed = false;
            var smUserDN = req.get('smuserdn').toLowerCase();

            db.updateSSHPublicKey(smUserDN, pubkeyInfo, function (err, document) {
                if (err) {
                    logger.error('Failed to update public key of user with sm_userdn: ' + smUserDN);
                    res.redirect('/auth/logout?updateerror=true');
                } else if (document) {

                    if (document.matchedCount === 1) {
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


    return openItrustRouter;
};

module.exports = router;