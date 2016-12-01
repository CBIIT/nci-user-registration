var express = require('express');
var ldap = require('ldapjs');
var appRouter = express.Router();
var fs = require('fs');
var tlsOptions;
var objectId = require('mongodb').ObjectID;

var router = function (logger, config, db, util) {

    tlsOptions = {
        ca: [fs.readFileSync(config.ldapproxy.cacert)]
    };

    appRouter.route('/')
        .get(function (req, res) {

            var searchObject = {
                name_lower: ''
            };

            db.searchApp(searchObject, function (err, results) {
                var apps = results;
                res.render('apps', {
                    apps: apps
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
            var searchObject = {
                name_lower: searchStr
            };

            db.searchApp(searchObject, function (err, results) {
                var apps = results;
                res.render('apps', {
                    apps: apps
                });
            });
        });

    appRouter.route('/app/add')
        .get(function (req, res) {
            res.render('newApp');
        });


    appRouter.route('/app/add')
        .post(function (req, res) {
            var name = req.body.name.trim();
            var description = req.body.description.trim();
            var appObject = {
                name: name,
                name_lower: name.toLowerCase(),
                description: description
            };

            db.addApplication(appObject, function () {
                logger.info('Added application ' + name);
                res.send('Application added');
            });
        });

    appRouter.route('/getAllGroups')
        .get(function (req, res) {
            db.getAllGroups(function (err, result) {
                res.send(result);
            });
        });

    appRouter.route('/app/:id/groups/read/add')
        .post(function (req, res) {
            var id = new objectId(req.params.id);
            var groupDN = req.body.read_group.toLowerCase().trim();

            db.addReadGroup(id, groupDN, function (err) {
                db.getApp(id, function (err, results) {
                    var apps = results;
                    res.render('apps', {
                        apps: apps
                    });
                });
            });
        });

    appRouter.route('/app/:id/groups/read/remove/:dn')
        .get(function (req, res) {
            var id = new objectId(req.params.id);
            var groupDN = req.params.dn.toLowerCase().trim();

            db.removeReadGroup(id, groupDN, function (err) {
                db.getApp(id, function (err, results) {
                    var apps = results;
                    res.render('apps', {
                        apps: apps
                    });
                });
            });
        });

    appRouter.route('/app/:id/groups/write/add')
        .post(function (req, res) {
            var id = new objectId(req.params.id);
            var groupDN = req.body.write_group.toLowerCase().trim();

            db.addWriteGroup(id, groupDN, function (err) {
                db.getApp(id, function (err, results) {
                    var apps = results;
                    res.render('apps', {
                        apps: apps
                    });
                });
            });
        });

    appRouter.route('/app/:id/groups/admin/add')
        .post(function (req, res) {
            var id = new objectId(req.params.id);
            var groupDN = req.body.admin_group.toLowerCase().trim();

            db.addAdminGroup(id, groupDN, function (err) {
                db.getApp(id, function (err, results) {
                    var apps = results;
                    res.render('apps', {
                        apps: apps
                    });
                });
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
            paged: true
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
                    db.insertGroups(groups, function () {
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