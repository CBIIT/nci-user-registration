var express = require('express');
var protectedItrustRouter = express.Router();


var router = function (logger, config, db, mailer) {

    protectedItrustRouter.route('/map/:id')

    .get(function (req, res) {
        logger.info('authenticated by iTrust');

        // do we still have an active session 
        var username = req.session.username;
        var email = req.session.email;
        var uuid = req.params.id;
        var sm_userdn = req.get('smuserdn').toLowerCase();

        if (!(username && email)) {
            logger.error('Failed to map with uuid' + uuid + '. Registration session expired. userdn: ' + sm_userdn);
            res.redirect('/auth/logout?mappingerror=true');
        } else if (!sm_userdn) {
            logger.error('Failed to map with uuid' + uuid + ': sm_userdn undefined!');
            res.redirect('/auth/logout?mappingerror=true');
        } else {


            var itrustInfo = {};
            itrustInfo.sm_userdn = sm_userdn;
            itrustInfo.processed = false;

            var userObject = {
                uuid: uuid,
                username: username,
                email: email
            };

            db.addMapping(userObject, itrustInfo, function (err) {
                if (err) {
                    logger.error('Failed to map ' + userObject.username + ' to userdn ' + sm_userdn);
                    res.redirect('/auth/logout?mappingerror=true');
                } else {
                    logger.info('Mapped ' + userObject.username + ' to userdn ' + sm_userdn);
                    logger.info('Praparing successful resistration email to ' + userObject.username);
                    db.log(userObject, 'Mapped to sm_userdn ' + sm_userdn);
                    var subject = config.mail.subjectPrefix + ' ### Your account was registered';
                    var message = '<p>Your account was registered successfully.</p>' +
                        '<p>The NCI account ' + userObject.username + ' was linked to your new NIH External account ' + itrustInfo.sm_userdn + '</p>' +
                        '<p>It will take up to 3 hours to complete the transfer of all your account information.</p>';
                    mailer.send(userObject.email, subject, message);

                    res.redirect('/auth/logout?mapped=true');
                }
            });
        }
    });

    return protectedItrustRouter;
};

module.exports = router;