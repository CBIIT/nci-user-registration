var express = require('express');
var ldap = require('ldapjs');
var adminRouter = express.Router();
var objectId = require('mongodb').ObjectID;
var searchOptions;
var js2xmlparser = require('js2xmlparser2');

var parserOptions = {
    wrapArray: {
        enabled: true
    }
};

var router = function (logger, config, db) {

    searchOptions = {
        filter: config.edir.filter,
        scope: 'sub',
        attributes: config.edir.attributes
    };

    adminRouter.route('/user/:id')
        .get(function (req, res) {
            var id = new objectId(req.params.id);

            db.getUser(id, function (err, results) {
                if (err) {
                    throw err;
                }
                res.send(id);

            });
        });

    adminRouter.route('/search')
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

    adminRouter.route('/init')
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

    // one time use to populate an empty collection
    adminRouter.route('/addUsers')
        .get(function (req, res) {
            logger.info('Populating user database');
            db.userCount(function (err, userCount) {
                if (userCount > 0) {
                    res.send('Collection not empty. Insert aborted!');
                } else {
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
                                var user = DeepTrim(entry.object);
                                user.extracted_dn_username = extractUsername(user.dn);
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

                                db.insertUsers(users, function (err, results) {
                                    res.send('User load completed. ');
                                });
                            });
                        });
                    });
                }
            });
        });

    adminRouter.route('/getItrustUpdates')
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

    adminRouter.route('/flagItrustUpdates')
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

    adminRouter.route('/getPublicKeyUpdates')
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

    adminRouter.route('/flagPublicKeyUpdates')
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

    return adminRouter;
};

function DeepTrim(obj) {
    for (var prop in obj) {
        var value = obj[prop],
            type = typeof value;
        if (value != null && (type == 'string' || type == 'object') && obj.hasOwnProperty(prop)) {
            if (type == 'object') {
                DeepTrim(obj[prop]);
            } else {
                obj[prop] = obj[prop].trim();
                if (prop == 'dn' || prop == 'cn' || prop == 'mail') {
                    obj[prop] = obj[prop].toLowerCase();
                }
            }
        }
    }
    return obj;
}

function extractUsername(dn) {
    var start = dn.split('=')[1];
    var result = start.substring(0, start.indexOf(',')).trim();

    return result;
}

module.exports = router;