var express = require('express');
var accessRequestRouter = express.Router();
var objectId = require('mongodb').ObjectID;
var js2xmlparser = require('js2xmlparser2');

var parserOptions = {
    wrapArray: {
        enabled: true
    }
};

var router = function (logger, config, db, util) {

    accessRequestRouter.route('/')
        .get(function (req, res) {

            var requests = [];

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

    accessRequestRouter.route('/getPendingApprovedRequests')
        .get(function (req, res) {
            logger.info('Pending approved requests requested.');
            db.getPendingApprovedRequests(function (err, requests) {
                var request;
                for (var i = 0; i < requests.length; i++) {
                    request = requests[i];
                    request._id = request._id.toString();
                    request.approved_resource.app_id = request.approved_resource.app_id.toString();
                }
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('requests', requests, parserOptions));
            });
        });

    accessRequestRouter.route('/flagProcessedRequests')
        .post(function (req, res) {

            var data = req.body.requestids.value;
            var convertedRequestIds = [];
            for (var i = 0; i < data.length; i++) {
                convertedRequestIds.push(new objectId(data[i]));
            }
            logger.info('The following requests have been reported as processed and will now be flagged: ' + convertedRequestIds);
            db.setRequestsProcessed(convertedRequestIds, function (err, result) {
                logger.info('Flagging result: ' + JSON.stringify(result));
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('result', result, parserOptions));
            });
        });

    return accessRequestRouter;
};

module.exports = router;