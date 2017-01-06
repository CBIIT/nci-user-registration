var express = require('express');
var accessRequestRouter = express.Router();
var objectId = require('mongodb').ObjectID;
var js2xmlparser = require('js2xmlparser2');

var parserOptions = {
    wrapArray: {
        enabled: true
    }
};

var ldap = require('ldapjs');
var fs = require('fs');
var tlsOptions;


var router = function (logger, config, db, util) {

    tlsOptions = {
        ca: [fs.readFileSync(config.ldapproxy.cacert)]
    };

    accessRequestRouter.route('/')
        .get(function (req, res) {

            var searchStr = '';
            var disposition = 'unknown';
            var stats = {};

            db.pendingApprovalCount(function (err, count) {
                stats.pendingApprovalCount = count;

                db.searchRequest(searchStr, disposition, function (err, results) {
                    var requests = results;
                    db.getAllApps(function (err, results) {
                        var apps = results;
                        res.render('requests', {
                            requests: requests,
                            stats: stats,
                            apps: apps,
                            disposition: disposition
                        });
                    });

                });
            });
        });

    accessRequestRouter.route('/request/:uuid')
        .get(function (req, res) {
            var uuid = req.params.uuid;
            var disposition = 'unknown';
            var stats = {};

            var alert = null;
            if (req.session.alert) {
                alert = req.session.alert;
                req.session.alert = null;
            }

            db.pendingApprovalCount(function (err, count) {
                stats.pendingApprovalCount = count;
                db.getRequest(uuid, function (err, result) {

                    var requests = result;
                    db.getAllApps(function (err, results) {
                        var apps = results;
                        res.render('requests', {
                            requests: requests,
                            stats: stats,
                            apps: apps,
                            disposition: disposition,
                            alert: alert ? alert : null
                        });
                    });
                });
            });

        });

    accessRequestRouter.route('/request/:id/approve')
        .post(function (req, res) {
            var requestId = req.params.id;
            var appLabel = 'app_' + requestId;
            var rolesLabel = 'acclevel_' + requestId;
            var appId;

            if (req.body[appLabel]) {
                appId = new objectId(req.body[appLabel]);
                console.log(appId);
            }
            var notes = req.body.notes;

            if (req.body.submit === 'Reject') {
                db.rejectRequest(requestId, notes, function () {
                    logger.info('Request ' + requestId + ' rejected');
                    res.redirect('/requests');
                });

            } else if (req.body.submit === 'Approve') {

                var accessLevelArray = req.body[rolesLabel];
                var approvedResource = {};

                if (!appId) {
                    logger.error('No app selected for request ' + requestId);
                    var alert = {
                        message: 'Error: No app selected. Request was not approved.',
                        severity_class: 'alert-danger'
                    };
                    req.session.alert = alert;
                    res.redirect('/requests/request/' + requestId);
                } else {

                    db.getSingleApp(appId, function (err, result) {
                        var app = result;

                        approvedResource.app_id = appId;
                        approvedResource.app_name = app.name;
                        approvedResource.access_level = [];
                        approvedResource.groups = [];

                        if (accessLevelArray) {
                            accessLevelArray.forEach(function (roleId) {
                                app.roles.forEach(function (role) {
                                    if (role.role_id === roleId) {
                                        approvedResource.access_level.push(role.role_name);
                                        approvedResource.groups.push(role.groups);
                                    }
                                });
                            });

                            db.approveRequest(requestId, approvedResource, notes, function (err, result) {
                                logger.info('Request ' + requestId + ' has been approved');
                                res.redirect('/requests');
                            });
                        } else {
                            logger.error('Failed to approve request ' + requestId + '. No roles selected or no roles configured for application ' + appId);
                            var alert = {
                                message: 'Error: No roles selected. Request was not approved.',
                                severity_class: 'alert-danger'
                            };
                            req.session.alert = alert;
                            res.redirect('/requests/request/' + requestId);
                        }

                    });

                }

            }

        });

    accessRequestRouter.route('/search')
        .post(function (req, res) {
            var searchStr = req.body.query.toLowerCase().trim();
            var disposition = req.body.disposition;
            var stats = {};

            db.pendingApprovalCount(function (err, count) {
                stats.pendingApprovalCount = count;

                db.searchRequest(searchStr, disposition, function (err, results) {
                    var requests = results;
                    db.getAllApps(function (err, results) {
                        var apps = results;
                        res.render('requests', {
                            requests: requests,
                            stats: stats,
                            apps: apps,
                            disposition: disposition
                        });
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

    accessRequestRouter.route('/unlockApproval/:id')
        .get(function (req, res) {
            var requestId = req.params.id;
            db.getSingleRequest(requestId, function (err, result) {

                var userDN = result.user_dn;
                console.log('USer DN: ' + userDN);

                getUser(userDN, logger, config)
                    .then(function (user) {
                        if (user['x-nci-alias']) {
                            logger.info('Unlocking request ' + requestId + '. x-nci-alias property found for user DN ' + userDN);
                            db.unlockRequestApproval(requestId, function () {
                                var alert = {
                                    message: 'The request is unlocked for approval.',
                                    severity_class: 'alert-success'
                                };
                                req.session.alert = alert;
                                res.redirect('/requests/request/' + requestId);
                            });
                        } else {
                            var alert = {
                                message: 'Approval could not be unlocled: x-nci-alias property was not found on this account.',
                                severity_class: 'alert-danger'
                            };
                            req.session.alert = alert;
                            res.redirect('/requests/request/' + requestId);
                        }
                    });

            });

        });

    return accessRequestRouter;
};

function getUser(userDN, logger, config) {

    return new Promise(function (resolve, reject) {

        logger.info('Looking up user with DN: ' + userDN);
        var user;

        var ldapClient = ldap.createClient({
            url: config.ldapproxy.host,
            tlsOptions: tlsOptions
        });

        var userSearchOptions = {
            scope: 'base',
            attributes: config.ldapproxy.user_attributes,
            sizeLimit: 1
        };

        ldapClient.bind(config.ldapproxy.dn, config.ldapproxy.password, function (err) {
            if (err) {
                logger.error(err);
                ldapClient.unbind();
                reject(Error(err.message));
            }

            ldapClient.search(userDN, userSearchOptions, function (err, ldapRes) {
                ldapRes.on('searchEntry', function (entry) {
                    user = entry.object;
                });
                ldapRes.on('searchReference', function () {});
                ldapRes.on('error', function (err) {
                    ldapClient.unbind();
                    reject(Error(err.message));
                });
                ldapRes.on('end', function () {
                    ldapClient.unbind();
                    resolve(user);
                });
            });
        });
    });
}

module.exports = router;