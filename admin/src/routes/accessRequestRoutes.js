var express = require('express');
var accessRequestRouter = express.Router();
var objectId = require('mongodb').ObjectID;

var router = function (logger, config, db, util) {

    accessRequestRouter.route('/request/:uuid')
        .get(function (req, res) {
            var uuid = req.params.uuid;

            db.getRequest(uuid, function (err, result) {

                var requests = result;
                res.render('requests', {
                    requests: requests
                });
            });

        });

    return accessRequestRouter;
};

module.exports = router;