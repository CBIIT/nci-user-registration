var express = require('express');
var accessRequestRouter = express.Router();
var objectId = require('mongodb').ObjectID;

var router = function (logger, config, db, util) {

    accessRequestRouter.route('/')
        .get(function (req, res) {

            var requests = [];
            var apps = [];

            res.render('requests', {
                requests: requests
            });
        });

    accessRequestRouter.route('/request/:uuid')
        .get(function (req, res) {
            var uuid = req.params.uuid;

            db.getRequest(uuid, function (err, result) {

                var requests = result;
                db.getAllApps(function (err, results) {
                    var apps = results;
                    res.render('requests', {
                        requests: requests,
                        apps: apps
                    });
                });
            });

        });

    accessRequestRouter.route('/request/:id/approve')
        .post(function (req, res) {
            var requestId = req.params.id;
            var appId = new objectId(req.body.app);
            var accessLevel = req.body.acclevel;

            var approvedResource = {};

            db.getSingleApp(appId, function (err, result) {
                var app = result;

                approvedResource.app_id = appId;
                approvedResource.app_name = app.name;
                approvedResource.access_level = accessLevel;
                approvedResource.groups = app[accessLevel];

                db.approveRequest(requestId, approvedResource, function (err, result) {


                    res.send('Approved');
                });

            });

        });

    accessRequestRouter.route('/search')
        .post(function (req, res) {
            var searchStr = req.body.query.toLowerCase().trim();


            db.searchRequest(searchStr, function (err, results) {
                var requests = results;
                db.getAllApps(function (err, results) {
                    var apps = results;
                    res.render('requests', {
                        requests: requests,
                        apps: apps
                    });
                });

            });
        });

    return accessRequestRouter;
};

module.exports = router;