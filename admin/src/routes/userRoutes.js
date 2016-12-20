var express = require('express');
var ldap = require('ldapjs');
var userRouter = express.Router();
var objectId = require('mongodb').ObjectID;
var searchOptions;
var js2xmlparser = require('js2xmlparser2');

var parserOptions = {
    wrapArray: {
        enabled: true
    }
};

var router = function (logger, config, db, util) {

    searchOptions = {
        filter: config.edir.filter,
        scope: 'sub',
        attributes: config.edir.attributes
    };

    userRouter.route('/user/:id')
        .get(function (req, res) {
            var id = new objectId(req.params.id);
            var alert = null;
            if (req.session.alert) {
                alert = req.session.alert;
                req.session.alert = null;
            }

            db.findUsers(id, function (err, users) {
                if (err) {
                    throw err;
                }

                var stats = {};

                db.userCount(function (err, count) {
                    stats.totalUsers = count;
                    db.externalUserCount(function (err, count) {
                        stats.externalUserCount = count;
                        db.selfRegisteredCount(function (err, count) {
                            stats.selfRegisteredCount = count;
                            db.processedCount(function (err, count) {
                                stats.processedCount = count;
                                db.pendingManualCount(function (err, count) {
                                    stats.pendingManualCount = count;
                                    db.pendingCount(function (err, count) {
                                        stats.pendingCount = count;
                                        res.render('users', {
                                            users: users,
                                            stats: stats,
                                            alert: alert
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

    userRouter.route('/search')
        .post(function (req, res) {
            var searchStr = req.body.searchstr.toLowerCase().trim();

            var users = [];
            var stats = {};

            db.userCount(function (err, count) {
                stats.totalUsers = count;
                db.externalUserCount(function (err, count) {
                    stats.externalUserCount = count;
                    db.selfRegisteredCount(function (err, count) {
                        stats.selfRegisteredCount = count;
                        db.processedCount(function (err, count) {
                            stats.processedCount = count;
                            db.pendingManualCount(function (err, count) {
                                stats.pendingManualCount = count;
                                db.pendingCount(function (err, count) {
                                    stats.pendingCount = count;
                                    if (!searchStr) {
                                        res.render('users', {
                                            users: users,
                                            stats: stats
                                        });
                                    } else {
                                        db.search(searchStr, function (err, results) {
                                            users = results;
                                            res.render('users', {
                                                users: users,
                                                stats: stats
                                            });
                                        });
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });

    userRouter.route('/pending')
        .get(function (req, res) {

            var users = [];
            var stats = {};

            db.userCount(function (err, count) {
                stats.totalUsers = count;
                db.externalUserCount(function (err, count) {
                    stats.externalUserCount = count;
                    db.selfRegisteredCount(function (err, count) {
                        stats.selfRegisteredCount = count;
                        db.processedCount(function (err, count) {
                            stats.processedCount = count;
                            db.pendingManualCount(function (err, count) {
                                stats.pendingManualCount = count;
                                db.pendingCount(function (err, count) {
                                    stats.pendingCount = count;
                                    db.getPendingUsers(function (err, results) {
                                        users = results;
                                        res.render('users', {
                                            users: users,
                                            stats: stats
                                        });
                                    });

                                });
                            });
                        });
                    });
                });
            });
        });

    userRouter.route('/init')
        .get(function (req, res) {
            db.userCount(function (err, count) {
                var users = [];
                var stats = {};
                db.userCount(function (err, count) {
                    stats.totalUsers = count;
                    db.externalUserCount(function (err, count) {
                        stats.externalUserCount = count;
                        db.selfRegisteredCount(function (err, count) {
                            stats.selfRegisteredCount = count;
                            db.processedCount(function (err, count) {
                                stats.processedCount = count;
                                db.pendingManualCount(function (err, count) {
                                    stats.pendingManualCount = count;
                                    db.pendingCount(function (err, count) {
                                        stats.pendingCount = count;
                                        res.render('users', {
                                            users: users,
                                            stats: stats
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

    userRouter.route('/updateUsers')
        .get(function (req, res) {
            logger.info('Updating user database');
            var users = [];
            var ldapClient = ldap.createClient({
                url: config.edir.host
            });

            ldapClient.bind(config.edir.dn, config.edir.password, function (err) {
                if (err) {
                    logger.error(err);
                    ldapClient.unbind();
                    throw err;
                }
                ldapClient.search(config.edir.searchBase, searchOptions, function (err, ldapRes) {
                    ldapRes.on('searchEntry', function (entry) {
                        var user = util.DeepTrim(entry.object);
                        user = util.ArrayArize(user);
                        user.extracted_dn_username = util.extractUsername(user.dn);
                        users.push(user);
                    });
                    ldapRes.on('searchReference', function () {});
                    ldapRes.on('error', function (err) {
                        ldapClient.unbind();
                        logger.error('error: ' + err.message);
                        res.send('There was an error while processing user updates. More information is available in the logs.');
                    });
                    ldapRes.on('end', function () {
                        ldapClient.unbind();
                        db.updateUsers(users, true, function (err, results) {
                            logger.info('Update results ---> ' + 'Matched: ' + results.matched + ' ### Modified: ' + results.modified + ' ### Newly Created: ' + results.upserted);
                            res.send('Matched: ' + results.matched + ' ### Modified: ' + results.modified + ' ### Newly Created: ' + results.upserted);
                        });
                    });
                });
            });
        });

    userRouter.route('/getItrustUpdates')
        .get(function (req, res) {
            logger.info('Itrust updates requested.');
            db.getUnprocessedItrustUsers(function (err, users) {
                for (var i = 0; i < users.length; i++) {
                    users[i]._id = users[i]._id.toString();
                }
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('users', users, parserOptions));
            });
        });

    userRouter.route('/getItrustOverrides')
        .get(function (req, res) {
            logger.info('Itrust overrides requested.');
            db.getOverridenItrustUsers(function (err, users) {
                for (var i = 0; i < users.length; i++) {
                    users[i]._id = users[i]._id.toString();
                }
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('users', users, parserOptions));
            });
        });

    userRouter.route('/flagItrustOverrides')
        .post(function (req, res) {

            var data = req.body.userids.value;
            var convertedUserIds = [];
            for (var i = 0; i < data.length; i++) {
                convertedUserIds.push(new objectId(data[i]));
            }
            logger.info('The following users have been reported as processed and will now be flagged: ' + convertedUserIds);
            db.setItrustOverridesProcessed(convertedUserIds, function (err, result) {
                logger.info('Flagging result: ' + JSON.stringify(result));
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('result', result, parserOptions));
            });
        });

    userRouter.route('/flagItrustUpdates')
        .post(function (req, res) {

            var data = req.body.userids.value;
            var convertedUserIds = [];
            for (var i = 0; i < data.length; i++) {
                convertedUserIds.push(new objectId(data[i]));
            }
            logger.info('The following users have been reported as processed and will now be flagged: ' + convertedUserIds);
            db.setItrustProcessed(convertedUserIds, function (err, result) {
                logger.info('Flagging result: ' + JSON.stringify(result));
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('result', result, parserOptions));
            });
        });

    userRouter.route('/getPublicKeyUpdates')
        .get(function (req, res) {
            logger.info('Public Key updates requested.');
            db.getUnprocessedPubKeyUsers(function (err, users) {
                for (var i = 0; i < users.length; i++) {
                    users[i]._id = users[i]._id.toString();
                }
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('users', users, parserOptions));
            });
        });

    userRouter.route('/flagPublicKeyUpdates')
        .post(function (req, res) {

            var data = req.body.userids.value;
            var convertedUserIds = [];
            for (var i = 0; i < data.length; i++) {
                convertedUserIds.push(new objectId(data[i]));
            }
            logger.info('The following users\' public keys have been reported as processed and will now be flagged: ' + convertedUserIds);
            db.setPubKeyProcessed(convertedUserIds, function (err, result) {
                logger.info('Flagging result: ' + JSON.stringify(result));
                res.set('Content-Type', 'text/xml');
                res.send(js2xmlparser('result', result, parserOptions));
            });
        });

    userRouter.route('/user/:id/setItrustInfo')
        .post(function (req, res) {
            var userId = new objectId(req.params.id);
            var smUserDN = req.body.sm_userdn.trim().toLowerCase();

            var alert = null;
            db.getSingleUser(userId, function (err, result) {
                if (err) {
                    throw err;
                }
                var user = result;
                var newItrustInfo = {};
                if (user.itrustinfo && user.itrustinfo.processed === true) {
                    // This is an override
                    logger.info('Overriding itrustinfo mapping for user DN' + user.dn);
                    if (smUserDN !== user.itrustinfo.sm_userdn) {
                        newItrustInfo.sm_userdn = smUserDN;
                        newItrustInfo.processed = false;
                        newItrustInfo.override = true;

                        db.isSmUserDnRegisteredToAnotherUser(userId, newItrustInfo, function (err, result) {
                            if (err) {
                                alert = {
                                    message: 'Error: Failed to set itrustinfo: ' + err,
                                    severity_class: 'alert-danger'
                                };
                                req.session.alert = alert;
                                res.redirect('/users/user/' + userId);
                            } else {
                                if (result) {
                                    logger.error('sm_userdn is already mapped to a different user. itrustInfo was not set! smUserdn: ' + smUserDN);
                                    alert = {
                                        message: 'Error: sm_userdn is already mapped to a different user. itrusInfo was not set! smUserdn: ' + smUserDN,
                                        severity_class: 'alert-danger'
                                    };
                                    req.session.alert = alert;
                                    res.redirect('/users/user/' + userId);
                                } else {
                                    db.setMappingByUserId(userId, newItrustInfo, function (err) {
                                        if (err) {
                                            logger.error('Failed setting itrustInfo - ' + err);
                                            alert = {
                                                message: 'Error: setting itrustinfo: ' + err,
                                                severity_class: 'alert-danger'
                                            };
                                            res.redirect('/users/user/' + userId);
                                        } else {
                                            db.log(user, 'itrustinfo mapping changed from ' + user.itrustinfo.sm_userdn + ' to ' + smUserDN);
                                            res.redirect('/users/user/' + userId);
                                        }
                                    });
                                }
                            }
                        });

                    } else {
                        // The same user_dn was submitted as the one on file
                        alert = {
                            message: 'Nothing to change',
                            severity_class: 'alert-danger'
                        };
                        req.session.alert = alert;
                        res.redirect('/users/user/' + userId);
                    }
                } else {
                    // This is a new mapping performed by the admin, or an override of an unprocessed record.
                    if (user.itrustinfo && (smUserDN === user.itrustinfo.sm_userdn)) {
                        // The same user_dn was submitted as the one on file
                        alert = {
                            message: 'Nothing to change',
                            severity_class: 'alert-danger'
                        };
                        req.session.alert = alert;
                        res.redirect('/users/user/' + userId);
                    } else {
                        newItrustInfo.sm_userdn = smUserDN;
                        newItrustInfo.processed = false;

                        db.isSmUserDnRegisteredToAnotherUser(userId, newItrustInfo, function (err, result) {
                            if (err) {
                                logger.error('Failed to set itrustinfo: ' + err);
                                alert = {
                                    message: 'Error: Failed to set itrustinfo: ' + err,
                                    severity_class: 'alert-danger'
                                };
                                req.session.alert = alert;
                                res.redirect('/users/user/' + userId);
                            } else {
                                if (result) {
                                    logger.error('sm_userdn is already mapped to a different user. itrustInfo was not set! smUserdn: ' + smUserDN);
                                    alert = {
                                        message: 'Error: sm_userdn is already mapped to a different user. itrusInfo was not set! smUserdn: ' + smUserDN,
                                        severity_class: 'alert-danger'
                                    };
                                    req.session.alert = alert;
                                    res.redirect('/users/user/' + userId);
                                } else {
                                    db.setMappingByUserId(userId, newItrustInfo, function (err) {
                                        if (err) {
                                            logger.error('Failed setting itrustInfo - ' + err);
                                            alert = {
                                                message: 'Error: setting itrustinfo: ' + err,
                                                severity_class: 'alert-danger'
                                            };
                                            res.redirect('/users/user/' + userId);
                                        } else {
                                            db.logWithUserID(userId, 'itrustinfo set by admin to ' + smUserDN);
                                            res.redirect('/users/user/' + userId);
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        });

    userRouter.route('/user/:id/setEmail')
        .post(function (req, res) {
            var userId = new objectId(req.params.id);
            var email = req.body.mail.trim().toLowerCase();

            db.emailExistsCheck(userId, email, function (err, result) {
                if (result) {
                    logger.error('email ' + email + '  is already registered to a different user. Could not set email for userId ' + userId);
                    var alert = {
                        message: 'Error: email ' + email + ' is already registered to a different user. ',
                        severity_class: 'alert-danger'
                    };
                    req.session.alert = alert;
                    res.redirect('/users/user/' + userId);
                } else {
                    db.getSingleUser(userId, function (err, result) {
                        var currentEmail = result.mail;
                        db.setEmail(userId, email, function () {
                            db.logWithUserID(userId, 'email changed by admin from ' + currentEmail + ' to ' + email);
                            res.redirect('/users/user/' + userId);
                        });
                    });

                }
            });
        });

    return userRouter;

};

module.exports = router;