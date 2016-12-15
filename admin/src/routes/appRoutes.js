var express = require('express');
var ldap = require('ldapjs');
var appRouter = express.Router();
var fs = require('fs');
var tlsOptions;
var objectId = require('mongodb').ObjectID;
var uuid = require('node-uuid');

var router = function (logger, config, db, util) {

    tlsOptions = {
        ca: [fs.readFileSync(config.ldapproxy.cacert)]
    };

    appRouter.route('/')
        .get(function (req, res) {
            var alert = null;
            if (req.session.alert) {
                alert = req.session.alert;
                req.session.alert = null;
            }
            db.searchApp('', function (err, results) {
                var apps = results;
                res.render('apps', {
                    apps: apps,
                    anchor: '#',
                    alert: alert ? alert : null
                });
            });
        });

    appRouter.route('/app/:id/a/:anchor')
        .get(function (req, res) {
            var alert = null;
            if (req.session.alert) {
                alert = req.session.alert;
                req.session.alert = null;
            }

            var appId = new objectId(req.params.id);
            var anchor = req.params.anchor === 'top' ? '#' : req.params.anchor;

            db.getApp(appId, function (err, results) {
                res.render('apps', {
                    apps: results,
                    anchor: anchor,
                    alert: alert ? alert : null
                });
            });
        });

    appRouter.route('/updateGroups')
        .get(function (req, res) {

            updateGroups(config.ldapproxy.federated_groups_dn, 'federated', logger, config, db, util)
                .then(function (response) {
                    logger.info('Result of group update from ou ' + config.ldapproxy.federated_groups_dn + ': ' + response);
                    updateGroups(config.ldapproxy.internal_groups_dn, 'internal', logger, config, db, util)
                        .then(function (response) {
                            logger.info('Result of group update from ou ' + config.ldapproxy.internal_groups_dn + ': ' + response);
                            res.send('Update of groups completed');
                        }, function (error) {
                            logger.error('Group update failed! OU: ' + config.ldapproxy.internal_groups_dn, error);
                            res.send('Group update failed. OU:  ' + config.ldapproxy.internal_groups_dn + '; ' + error.message);
                        });
                }, function (error) {
                    logger.error('Group update failed! OU: ' + config.ldapproxy.federated_groups_dn, error);
                    res.send('Group update failed. OU:  ' + config.ldapproxy.federated_groups_dn + '; ' + error.message);
                });
        });


    appRouter.route('/search')
        .post(function (req, res) {
            var searchStr = req.body.name.toLowerCase().trim();

            db.searchApp(searchStr, function (err, results) {
                var apps = results;
                res.render('apps', {
                    apps: apps,
                    anchor: '#'
                });
            });
        });

    appRouter.route('/app/addorupdate')
        .post(function (req, res) {
            var appIdStr = req.body.appId.trim();
            var appIdObj;
            if (appIdStr) {
                appIdObj = new objectId(appIdStr);
            }

            var name = req.body.name.trim();
            var name_lower = name.toLowerCase();
            var description = req.body.description.trim();

            var appObject = {
                name: name,
                name_lower: name_lower,
                description: description
            };

            if (appIdObj) {
                db.appExistsCheck2(appIdObj, name_lower, function (err, exists) {
                    if (exists) {
                        logger.error('Failed to update application. An application ' + name + ' already exists.');
                        var alert = {
                            message: 'Error: Failed to update application! Application ' + name + ' already exists.',
                            severity_class: 'alert-danger'
                        };
                        req.session.alert = alert;
                        res.redirect('/apps');
                    } else {
                        db.updateApplication(appIdObj, appObject, function (err) {
                            logger.info('Modified application ' + name);
                            res.redirect('/apps/app/' + appIdStr + '/a/top');
                        });
                    }
                });
            } else {
                db.appExistsCheck(name_lower, function (err, exists) {
                    if (exists) {
                        logger.error('Failed to create application. An application with this name already exists.');
                        var alert = {
                            message: 'Error: Failed to create application! Application ' + name + ' already exists.',
                            severity_class: 'alert-danger'
                        };
                        req.session.alert = alert;
                        res.redirect('/apps');
                    } else {
                        var roles = [];
                        appObject.roles = roles;

                        db.addApplication(appObject, function (err, result) {
                            if (err) {
                                res.send('Failed to create application: ' + err);
                            } else {
                                logger.info('Added application ' + name);
                                res.redirect('/apps/app/' + result.insertedId + '/a/top');
                            }
                        });
                    }
                });
            }
        });

    appRouter.route('/getAllGroups')
        .get(function (req, res) {
            db.getAllGroups(function (err, result) {
                res.send(result);
            });
        });

    appRouter.route('/app/:id/roles')
        .get(function (req, res) {
            var appId = new objectId(req.params.id);
            db.getSingleApp(appId, function (err, result) {
                res.send(result.roles);
            });
        });

    appRouter.route('/app/:id/remove')
        .get(function (req, res) {
            var appId = new objectId(req.params.id);

            db.removeApp(appId, function () {
                res.redirect('/apps');
            });
        });

    appRouter.route('/app/:id/roles/role/:roleId/remove')
        .get(function (req, res) {
            var appId = new objectId(req.params.id);
            var roleId = req.params.roleId;
            db.removeRoleFromApp(appId, roleId, function (err) {
                res.redirect('/apps/app/' + appId + '/a/top');
            });
        });


    appRouter.route('/app/roles/add')
        .post(function (req, res) {
            var appIdStr = req.body.appId.trim();
            var appId = new objectId(appIdStr);

            var roleName = req.body.roleName.trim();
            var role = {};
            role.role_id = uuid.v4();
            role.role_name = roleName;

            role.groups = [];

            db.containsRole(appId, roleName, function (err, result) {
                if (result) {
                    logger.error('Failed to add role to application with ID' + appIdStr + '. Role + ' + roleName + ' already exists.');
                    var alert = {
                        message: 'Error: Failed to add role! Role ' + roleName + ' already exists.',
                        severity_class: 'alert-danger'
                    };

                    req.session.alert = alert;
                    res.redirect('/apps/app/' + appId + '/a/top');

                } else {
                    db.addRole(appId, role, function () {
                        logger.info('Role ' + roleName + ' added to application ID ' + appId);
                        res.redirect('/apps/app/' + appId + '/a/top');
                    });
                }
            });

        });

    appRouter.route('/app/:id/roles/:roleId/addGroup')
        .post(function (req, res) {
            var appId = new objectId(req.params.id);
            var roleId = req.params.roleId;
            var groupDN = req.body.group.toLowerCase().trim();

            db.addGroupToRole(appId, roleId, groupDN, function (err) {
                var anchor = appId + '_' + roleId;
                res.redirect('/apps/app/' + appId + '/a/' + anchor);
            });
        });

    appRouter.route('/app/:id/roles/:roleId/removeGroup/:groupdn')
        .get(function (req, res) {
            var appId = new objectId(req.params.id);
            var roleId = req.params.roleId;
            var groupDN = req.params.groupdn.toLowerCase().trim();

            db.removeGroupFromRole(appId, roleId, groupDN, function (err) {
                var anchor = appId + '_' + roleId;
                res.redirect('/apps/app/' + appId + '/a/' + anchor);
            });
        });

    return appRouter;

};

function updateGroups(ou, groupType, logger, config, db, util) {

    return new Promise(function (resolve, reject) {

        logger.info('Updating groups table from ou: ' + ou);
        var groups = [];

        var ldapClient = ldap.createClient({
            url: config.ldapproxy.host,
            tlsOptions: tlsOptions
        });

        var groupSearchOptions = {
            scope: 'sub',
            attributes: config.ldapproxy.group_attributes,
            paged: true,
            sizeLimit: 1000
        };

        ldapClient.bind(config.ldapproxy.dn, config.ldapproxy.password, function (err) {
            if (err) {
                logger.error(err);
                ldapClient.unbind();
                reject(Error(err.message));
            }

            ldapClient.search(ou, groupSearchOptions, function (err, ldapRes) {
                ldapRes.on('searchEntry', function (entry) {
                    var group = util.DeepTrim(entry.object);
                    group = util.ArrayArize(group);
                    group.type = groupType;
                    groups.push(group);
                });
                ldapRes.on('searchReference', function () {});
                ldapRes.on('error', function (err) {
                    ldapClient.unbind();
                    reject(Error(err.message));
                });
                ldapRes.on('end', function () {
                    ldapClient.unbind();
                    db.reloadGroups(groups, function () {
                        resolve('Success!');
                    });


                    // db.updateGroups(groups, true, function (err, results) {
                    //     // logger.info('Update results ---> ' + 'Matched: ' + results.matched + ' ### Modified: ' + results.modified + ' ### Newly Created: ' + results.upserted);
                    //     // res.send('Matched: ' + results.matched + ' ### Modified: ' + results.modified + ' ### Newly Created: ' + results.upserted);
                    //     res.send('Done');
                    // });
                });
            });
        });

    });

}

module.exports = router;