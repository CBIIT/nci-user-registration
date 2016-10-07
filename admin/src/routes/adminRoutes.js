var express = require('express');
var ldap = require('ldapjs');
var adminRouter = express.Router();
var objectId = require('mongodb').ObjectID;
var searchOptions;

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

            //at least one search value
            if (!searchObject.cn && !searchObject.email) {
                res.render('index', {
                    users: []
                });
            } else {
                db.search(searchObject, function (err, results) {
                    res.render('index', {
                        users: results
                    });

                });
            }
        });

    // one time use to populate an empty collection
    adminRouter.route('/addUsers')
        .get(function (req, res) {
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