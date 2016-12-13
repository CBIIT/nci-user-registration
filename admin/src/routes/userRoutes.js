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

            db.getUser(id, function (err, result) {
                if (err) {
                    throw err;
                }
                res.send(result);

            });
        });

    userRouter.route('/search')
        .post(function (req, res) {
            var searchObject = {
                cn: req.body.cn.toLowerCase().trim(),
                email: req.body.email.toLowerCase().trim()
            };

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
                                if (!searchObject.cn && !searchObject.email) {
                                    res.render('index', {
                                        users: users,
                                        stats: stats
                                    });
                                } else {
                                    db.search(searchObject, function (err, results) {
                                        users = results;
                                        res.render('index', {
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
                                stats.processedCount = count; <<
                                db.pendingManualCount(function (err, count) {
                                    stats.pendingManualCount = count;
                                    res.render('index', {
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

            db.getUser(userId, function (err, result) {
                if (err) {
                    throw err;
                }
                var user = result;
                var newItrustInfo = {};
                if (user.itrustinfo && user.itrustinfo.processed) {
                    // This is an override
                    logger.info('Overriding itrustinfo mapping for user DN' + user.dn);
                    if (smUserDN !== user.itrustinfo.sm_userdn) {
                        newItrustInfo.sm_userdn = smUserDN;
                        newItrustInfo.processed = false;
                        newItrustInfo.override = true;

                        db.isSmUserDnRegistered(newItrustInfo, function (err, result) {
                            if (err) {
                                res.send('Error: Failed setting itrustInfo - ' + err);
                            } else {
                                if (result) {
                                    res.send('Error: sm_userdn is already maped to a different user. iTrustInfo was not changed!');
                                } else {
                                    db.setMappingByUserId(userId, newItrustInfo, function (err) {
                                        if (err) {
                                            res.send('Error: Failed setting itrustInfo - ' + err);
                                        } else {
                                            db.log(user, 'itrustinfo mapping changed from ' + user.itrustinfo.sm_userdn + ' to ' + smUserDN);
                                            res.send('Override completed successfully');
                                        }
                                    });
                                }
                            }
                        });

                    } else {
                        res.send('Nothing to change');
                    }
                } else {
                    // This is a new mapping performed by the admin, or an override of an unprocessed record.
                    newItrustInfo.sm_userdn = smUserDN;
                    newItrustInfo.processed = false;

                    db.isSmUserDnRegistered(newItrustInfo, function (err, result) {
                        if (err) {
                            res.send('Error: Failed setting itrustInfo - ' + err);
                        } else {
                            if (result) {
                                res.send('Error: sm_userdn is already maped to a different user. itrusInfo was not set!');
                            } else {
                                db.setMappingByUserId(userId, newItrustInfo, function (err) {
                                    if (err) {
                                        res.send('Error: Failed setting itrustInfo - ' + err);
                                    } else {
                                        db.logWithUserID(userId, 'itrustinfo set by admin to ' + smUserDN);
                                        res.send('ItrustInfo set successfully');
                                    }
                                });
                            }
                        }
                    });
                }
            });
        });

    return userRouter;
};

module.exports = router;