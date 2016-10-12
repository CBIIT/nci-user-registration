var express = require('express');
var protectedRouter = express.Router();

var router = function (logger, db) {

    protectedRouter.route('/map/:id')

    .get(function (req, res) {
        logger.info('authenticated by iTrust');

        var sm_userdn = req.get('smuserdn').toLowerCase();

        var itrustInfo = {};
        itrustInfo.sm_userdn = sm_userdn;

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

    protectedRouter.rout('/update')
        .post(function (req, res) {
            var certificate = req.body.certificate.trim();
            var sm_userdn = req.get('smuserdn').toLowerCase();

            db.updateCertificate(sm_userdn, certificate, function (err, document) {
                if (err) {
                    logger.error('Failed to update certificate of user with sm_userdn: ' + sm_userdn);
                    res.redirect('/auth/logout?updateerror=true');
                } else if (document) {
                    var userObject = {
                        username: document.extracted_dn_username,
                        email: document.mail
                    };

                    logger.info('Updated public key record for user ' + document.extracted_dn_username);
                    db.log(userObject, 'Certificate uploaded by user. ' + sm_userdn);
                    res.redirect('/auth/logout?updatesuccess=true');
                }
            });

        });


    return protectedRouter;
};

module.exports = router;