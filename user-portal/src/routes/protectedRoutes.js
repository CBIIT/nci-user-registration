var express = require('express');
var protectedRouter = express.Router();

var router = function (logger, db) {

    protectedRouter.route('/map/:id')

    .get(function (req, res) {
        logger.info('authenticated by iTrust');

        var sm_userdn = req.get('sm_userdn');
        var sm_universalid = req.get('sm_universalid');
        var sm_samaccountname = req.get('sm_samaccountname');
        console.log('samaccountname: ' + sm_samaccountname);

        var itrustInfo = {};
        itrustInfo.sm_userdn = sm_userdn;
        itrustInfo.sm_universalid = sm_universalid;
        itrustInfo.sm_samaccountname = sm_samaccountname;


        var userObject = {
            uuid: req.params.id,
            username: req.session.username,
            email: req.session.email
        };

        db.addMapping(userObject, itrustInfo, function (err) {
            if (err) {
                logger.error('Failed to map ' + userObject.username + ' to samaccountname ' + sm_samaccountname);
                res.redirect('/auth/logout?mappingerror=true');
            } else {
                logger.info('Mapped ' + userObject.username + ' to samaccountname ' + sm_samaccountname);
                db.log(userObject, 'Mapped to sm_samaccountname ' + sm_samaccountname);
                res.redirect('/auth/logout?mapped=true');
            }
        });
    });

    protectedRouter.route('/update')

    .get(function (req, res) {
        res.render('updateForm');
    });


    return protectedRouter;
};

module.exports = router;