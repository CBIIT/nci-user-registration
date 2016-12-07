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

            db.getUser(id, function (err, results) {
                if (err) {
                    throw err;
                }
                res.send(id);

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
                            //at least one search value
                            if (!searchObject.cn && !searchObject.email) {
                                res.render('users', {
                                    users: users,
                                    stats: stats
                                });
                            } else {
                                db.search(searchObject, function (err, results) {
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
                        throw err;
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

    return userRouter;
};

module.exports = router;