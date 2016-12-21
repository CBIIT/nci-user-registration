var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var db;
var confirmTimeout;
var loggerRef;
var usersCollection;
var groupsCollection;
var appsCollection;
var requestCollection;
var utilRef;
var configRef;

module.exports = {
    connect: function (logger, config, util, cb) {
        logger.info('Connecting to database...');
        confirmTimeout = config.confirm.timeout;
        loggerRef = logger;
        utilRef = util;
        configRef = config;
        usersCollection = config.db.users_collection;
        groupsCollection = config.db.groups_collection;
        appsCollection = config.db.apps_collection;
        requestCollection = config.db.request_collection;
        MongoClient.connect(config.db.url, function (err, database) {
            if (err) {
                throw err;
            }
            db = database;
            cb();
        });
    },

    getAllUsers: function (cb) {
        var collection = db.collection(usersCollection);
        collection.find({}).toArray(
            function (err, results) {
                cb(err, results);
            });
    },

    getPendingUsers: function (cb) {
        var collection = db.collection(usersCollection);
        collection.find({
            $or: [{
                'itrustinfo.processed': 'pending'
            }, {
                'itrustinfo.processed': 'manual'
            }]
        }).toArray(
            function (err, results) {
                cb(err, results);
            });
    },

    findUsers: function (id, cb) {
        var collection = db.collection(usersCollection);
        collection.find({
            _id: id
        }).toArray(function (err, results) {
            cb(err, results);
        });
    },

    getSingleUser: function (id, cb) {
        var collection = db.collection(usersCollection);
        collection.findOne({
            _id: id
        }, function (err, result) {
            cb(err, result);
        });
    },

    search: function (searchStr, cb) {
        var collection = db.collection(usersCollection);

        collection.find({
            $or: [{
                extracted_dn_username: searchStr
            }, {
                mail: searchStr
            }, {
                fullName: {
                    $regex: searchStr,
                    $options: 'i'
                }
            }, {
                givenName: {
                    $regex: searchStr,
                    $options: 'i'
                }
            }]
        }).toArray(
            function (err, results) {
                cb(err, results);
            });
    },

    findUserByEmailAndCn: function (userObject, cb) {
        var collection = db.collection(usersCollection);
        collection.findOne({
            mail: userObject.email,
            extracted_dn_username: userObject.username
        }, function (err, document) {
            return cb(err, document);
        });
    },

    log: function (userObject, message) {
        var collection = db.collection(usersCollection);
        var email = userObject.email;
        var username = userObject.username;
        collection.updateOne({
            mail: email,
            extracted_dn_username: username
        }, {
            $push: {
                logs: utilRef.ts() + message
            }
        });
    },

    logWithUserID: function (userId, message) {
        var collection = db.collection(usersCollection);
        collection.updateOne({
            '_id': userId
        }, {
            $push: {
                logs: utilRef.ts() + message
            }
        });
    },

    updateUUID: function (userObject, uuid, cb) {
        var collection = db.collection(usersCollection);
        collection.updateOne({
            mail: userObject.email,
            extracted_dn_username: userObject.username
        }, {
            $set: {
                uuid: {
                    uuid: uuid,
                    expires: Date.now() + confirmTimeout * 60 * 1000
                }
            }
        }, function (err) {
            if (err) {
                loggerRef.error('Failed to update UUID. CN: ' + userObject.username + ', email: ' + userObject.email);
                cb(err);
            } else {
                cb();
            }

        });
    },

    addMapping: function (userObject, itrustInfo, cb) {
        var collection = db.collection(usersCollection);
        collection.updateOne({
            'uuid.uuid': userObject.uuid,
            'extracted_dn_username': userObject.username,
            'mail': userObject.email
        }, {
            $set: {
                itrustinfo: itrustInfo
            }
        }, function (err) {
            if (err) {
                loggerRef.error('Failed to persist itrustinfo for ' + userObject.username);
            }
            cb(err);
        });
    },

    setMappingByUserId: function (userId, itrustInfo, cb) {
        var collection = db.collection(usersCollection);
        collection.updateOne({
            '_id': userId
        }, {
            $set: {
                itrustinfo: itrustInfo
            }
        }, function (err) {
            if (err) {
                loggerRef.error('Failed to persist itrustinfo for user ID ' + userId);
            }
            cb(err);
        });
    },

    isSmUserDnRegisteredToAnotherUser(userId, itrustInfo, cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            '_id': {
                $ne: userId
            },
            'itrustinfo.sm_userdn': itrustInfo.sm_userdn
        }, function (err, result) {
            if (err) {
                loggerRef.error('Failed to get count of sm_userdn ' + itrustInfo.sm_userdn + ' mappings');
            }
            if (result === 0) {
                cb(err, false);
            } else {
                cb(err, true);
            }
        });

    },

    insertUsers: function (users, cb) {
        var collection = db.collection(usersCollection);
        collection.insertMany(users, {
            ordered: false
        }, function () {
            cb();
        });
    },

    reloadGroups: function (groups, cb) {
        var collection = db.collection(groupsCollection);
        collection.remove({}, function () {
            collection.insertMany(groups, {
                ordered: false
            }, function () {
                // this.getAllApps(function (err, apps) {
                //     apps.forEach(function (app) {

                //     });
                // });
                cb();
            });
        });
    },


    updateUsers: function (users, flag, cb) {
        var matched = 0;
        var modified = 0;
        var upserted = 0;
        var processed = 0;
        var user;
        for (var i = 0; i < users.length; i++) {
            user = users[i];
            if (user.entrustuser) {
                updateSingle(user, flag, function (err, result) {
                    matched += result.matchedCount;
                    modified += result.modifiedCount;
                    upserted += result.upsertedCount;
                    processed += 1;
                    if (processed === users.length) {
                        var results = {};
                        results.matched = matched;
                        results.modified = modified;
                        results.upserted = upserted;
                        cb(null, results);
                    }
                });
            }
        }
    },

    confirmUUID: function (uuid, cb) {
        var collection = db.collection(usersCollection);
        collection.findOne({
            'uuid.uuid': uuid
        }, function (err, document) {

            if (err) {
                cb(err);
            }
            if (document) {
                if (document.uuid.expires > Date.now()) {
                    // UUID found and has not expired
                    cb(null, document, false);

                } else {
                    // UUID found, but it has expired
                    cb(null, document, true);
                }
            } else {
                // UUID not found
                cb();
            }
        });
    },

    getUnprocessedItrustUsers: function (cb) {
        var collection = db.collection(usersCollection);
        collection.find({
            'itrustinfo.processed': false,
            'itrustinfo.override': {
                $exists: false
            }
        }, {
            'entrustuser': 1,
            'dn': 1,
            'extracted_dn_username': 1,
            'mail': 1,
            'objectClass': 1,
            'groupMembership': 1,
            'uidnumber': 1,
            'gidnumber': 1,
            'homedirectory': 1,
            'loginshell': 1,
            'itrustinfo': 1,
            'fullName': 1,
            'givenName': 1,
            'telephoneNumber': 1,
            'sn': 1
        }).toArray(function (err, results) {
            return cb(err, results);
        });
    },

    getOverridenItrustUsers: function (cb) {
        var collection = db.collection(usersCollection);
        collection.find({
            'itrustinfo.processed': false,
            'itrustinfo.override': {
                $exists: true
            }
        }, {
            'entrustuser': 1,
            'dn': 1,
            'extracted_dn_username': 1,
            'mail': 1,
            'objectClass': 1,
            'groupMembership': 1,
            'uidnumber': 1,
            'gidnumber': 1,
            'homedirectory': 1,
            'loginshell': 1,
            'itrustinfo': 1,
            'fullName': 1,
            'givenName': 1,
            'telephoneNumber': 1,
            'sn': 1
        }).toArray(function (err, results) {
            return cb(err, results);
        });
    },

    getUnprocessedPubKeyUsers: function (cb) {
        var collection = db.collection(usersCollection);
        collection.find({
            'pubkeyinfo.processed': false
        }, {
            'entrustuser': 1,
            'itrustinfo': 1,
            'pubkeyinfo': 1
        }).toArray(function (err, results) {
            return cb(err, results);
        });
    },

    setItrustProcessed: function (userIds, cb) {
        var collection = db.collection(usersCollection);
        var bulk = collection.initializeUnorderedBulkOp();
        bulk.find({
            _id: {
                $in: userIds
            }
        }).update({
            $set: {
                'itrustinfo.processed': true
            }
        });
        bulk.execute(function (err, result) {
            return cb(err, result.toJSON());
        });
    },

    setItrustOverridesProcessed: function (userIds, cb) {
        var collection = db.collection(usersCollection);
        var bulk = collection.initializeUnorderedBulkOp();
        bulk.find({
            _id: {
                $in: userIds
            }
        }).update({
            $set: {
                'itrustinfo.processed': true,

            },
            $unset: {
                'itrustinfo.override': ''
            }
        });
        bulk.execute(function (err, result) {
            return cb(err, result.toJSON());
        });
    },

    setPubKeyProcessed: function (userIds, cb) {
        var collection = db.collection(usersCollection);
        var bulk = collection.initializeUnorderedBulkOp();
        bulk.find({
            _id: {
                $in: userIds
            }
        }).update({
            $set: {
                'pubkeyinfo.processed': true
            }
        });
        bulk.execute(function (err, result) {
            return cb(err, result.toJSON());
        });
    },

    userCount: function (cb) {
        var collection = db.collection(usersCollection);

        collection.count(function (err, count) {
            return cb(err, count);
        });
    },

    externalUserCount: function (cb) {
        var collection = db.collection(usersCollection);

        collection.count({
            groupMembership: configRef.edir.externaldn
        }, function (err, count) {
            return cb(err, count);
        });
    },

    selfRegisteredCount: function (cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            itrustinfo: {
                $exists: true
            }
        }, function (err, count) {
            return cb(err, count);
        });
    },

    processedCount: function (cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            'itrustinfo.processed': true
        }, function (err, count) {
            return cb(err, count);
        });
    },

    addApplication: function (appObject, cb) {
        var collection = db.collection(appsCollection);
        collection.insertOne({
            name: appObject.name,
            name_lower: appObject.name_lower,
            description: appObject.description,
            roles: appObject.roles
        }, function (err, result) {
            if (err) {
                loggerRef.error('Error: Failed to create application ' + appObject.name + ': ' + err);
            }
            cb(err, result);
        });
    },

    updateApplication: function (appId, appObject, cb) {
        var collection = db.collection(appsCollection);
        collection.updateOne({
            '_id': appId,
        }, {
            $set: {
                name: appObject.name,
                name_lower: appObject.name_lower,
                description: appObject.description
            }
        }, function (err) {
            if (err) {
                loggerRef.error('Failed to update application ' + appObject.name);
            }
            cb(err);
        });
    },

    searchRequest: function (searchStr, disposition, cb) {
        var collection = db.collection(requestCollection);

        collection.find({
            $and: [{
                approval: disposition
            }, {
                $or: [{
                    request_id: searchStr
                }, {
                    requested_app: {
                        $regex: searchStr
                    }
                }, {
                    user_dn: {
                        $regex: searchStr
                    }
                }]
            }]
        }).toArray(
            function (err, results) {
                cb(err, results);
            });

    },

    searchApp: function (searchStr, cb) {
        var collection = db.collection(appsCollection);

        collection.find({

            $or: [{
                name_lower: searchStr
            }, {
                name_lower: {
                    $regex: searchStr ? searchStr : /.*/
                }
            }]
        }).toArray(
            function (err, results) {
                cb(err, results);
            });
    },

    appExistsCheck: function (name, cb) {
        var collection = db.collection(appsCollection);

        collection.count({
            name_lower: name.toLowerCase()
        }, function (err, count) {
            var result = count === 0 ? false : true;
            return cb(err, result);
        });
    },

    appExistsCheck2: function (id, name, cb) {
        var collection = db.collection(appsCollection);

        collection.count({
            _id: {
                $ne: id
            },
            name_lower: name.toLowerCase()
        }, function (err, count) {
            var result = count === 0 ? false : true;
            return cb(err, result);
        });
    },

    emailExistsCheck: function (id, mail, cb) {
        var collection = db.collection(usersCollection);

        collection.count({
            _id: {
                $ne: id
            },
            mail: mail.trim().toLowerCase()
        }, function (err, count) {
            var result = count === 0 ? false : true;
            return cb(err, result);
        });
    },

    setEmail: function (id, mail, cb) {
        var collection = db.collection(usersCollection);

        collection.updateOne({
            _id: id
        }, {
            $set: {
                mail: mail.trim().toLowerCase()
            }
        }, function (err, result) {
            return cb(err, result);
        });
    },
    setProperty: function (id, property, value, cb) {
        var collection = db.collection(usersCollection);

        collection.updateOne({
            _id: id
        }, {
            $set: {
                [property]: value.trim()
            }
        }, function (err, result) {
            return cb(err, result);
        });
    },

    getApp: function (id, cb) {
        var collection = db.collection(appsCollection);
        collection.find({
            _id: id
        }).toArray(
            function (err, results) {
                cb(err, results);
            });
    },

    getSingleApp(id, cb) {
        var collection = db.collection(appsCollection);
        collection.findOne({
            _id: id
        }, function (err, result) {
            cb(err, result);
        });
    },

    getAllApps: function (cb) {
        var collection = db.collection(appsCollection);
        collection.find().toArray(
            function (err, results) {
                cb(err, results);
            });
    },


    getAllGroups: function (cb) {
        var collection = db.collection(groupsCollection);
        collection.find({}, {
            dn: 1
        }).toArray(function (err, results) {
            cb(err, results);
        });
    },

    addGroupToRole(appId, roleId, groupDN, cb) {
        var collection = db.collection(appsCollection);
        collection.update({
            _id: appId,
            roles: {
                $elemMatch: {
                    role_id: roleId
                }
            }
        }, {
            $addToSet: {
                'roles.$.groups': groupDN
            }
        }, function (err) {
            cb(err);
        });
    },

    addRole(appId, role, cb) {
        var collection = db.collection(appsCollection);
        collection.update({
            _id: appId,
        }, {
            $addToSet: {
                roles: role
            }
        }, function (err) {
            cb(err);
        });
    },

    containsRole(appId, roleName, cb) {
        var collection = db.collection(appsCollection);
        collection.count({
            _id: appId,
            roles: {
                $elemMatch: {
                    role_name: roleName
                }
            }
        }, function (err, count) {
            if (count === 0) {
                return cb(err, false);
            } else {
                return cb(err, true);
            }
        });
    },

    removeApp(appId, cb) {
        var collection = db.collection(appsCollection);

        collection.remove({
            _id: appId
        }, function () {
            cb();
        });
    },

    removeRoleFromApp(appId, roleId, cb) {
        var collection = db.collection(appsCollection);

        collection.update({
            _id: appId
        }, {
            $pull: {
                roles: {
                    role_id: roleId
                }
            }
        }, function () {
            cb();
        });
    },

    removeGroupFromRole(appId, roleId, groupDN, cb) {
        var collection = db.collection(appsCollection);

        collection.update({
            _id: appId,
            roles: {
                $elemMatch: {
                    role_id: roleId
                }
            }
        }, {
            $pull: {
                'roles.$.groups': groupDN
            }
        }, function (err) {
            cb(err);
        });
    },

    getRequest(uuid, cb) {
        var collection = db.collection(requestCollection);

        collection.find({
            request_id: uuid
        }).toArray(
            function (err, results) {
                cb(err, results);
            });
    },

    approveRequest(requestId, approvedResource, notes, cb) {
        var collection = db.collection(requestCollection);

        collection.updateOne({
            request_id: requestId,
            approval: 'unknown'
        }, {
            $set: {
                approval: 'approved',
                approved_resource: approvedResource,
                notes: notes
            }
        }, function (err, result) {
            cb(err, result);
        });
    },

    rejectRequest(requestId, notes, cb) {
        var collection = db.collection(requestCollection);

        collection.updateOne({
            request_id: requestId,
            approval: 'unknown'
        }, {
            $set: {
                approval: 'rejected',
                notes: notes
            }
        }, function () {
            cb();
        });
    },

    getPendingApprovedRequests(cb) {
        var collection = db.collection(requestCollection);
        collection.find({
            'approval': 'approved',
            'processed': {
                $exists: false
            }
        }, {
            'user_dn': 1,
            'approved_resource': 1
        }).toArray(function (err, results) {
            return cb(err, results);
        });
    },
    setRequestsProcessed: function (requestIds, cb) {
        var collection = db.collection(requestCollection);
        var bulk = collection.initializeUnorderedBulkOp();
        bulk.find({
            _id: {
                $in: requestIds
            }
        }).update({
            $set: {
                'processed': true
            }
        });
        bulk.execute(function (err, result) {
            return cb(err, result.toJSON());
        });
    },
    pendingApprovalCount: function (cb) {
        var collection = db.collection(requestCollection);

        collection.count({
            approval: 'unknown'
        }, function (err, count) {
            return cb(err, count);
        });
    },
    pendingManualCount: function (cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            'itrustinfo.processed': 'manual'
        }, function (err, count) {
            return cb(err, count);
        });
    },
    pendingCount: function (cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            'itrustinfo.processed': 'pending'
        }, function (err, count) {
            return cb(err, count);
        });
    }
};


function updateSingle(user, flag, cb) {
    var collection = db.collection(usersCollection);
    collection.updateOne({
        'entrustuser': user.entrustuser
    }, {
        $set: {
            'entrustuser': user.entrustuser,
            'dn': user.dn,
            'extracted_dn_username': user.extracted_dn_username,
            'nciNihIC': user.nciNihIC,
            'nciNihUID': user.nciNihUID,
            'workforceID': user.workforceID,
            'mail': user.mail,
            'givenName': user.givenName,
            'fullName': user.fullName,
            'telephoneNumber': user.telephoneNumber,
            'sn': user.sn,
            'objectClass': user.objectClass,
            'groupMembership': user.groupMembership,
            'cn': user.cn,
            'uid': user.uid,
            'uidnumber': user.uidnumber,
            'gidnumber': user.gidnumber,
            'homedirectory': user.homedirectory,
            'loginshell': user.loginshell
        }
    }, {
        upsert: true
    }, function (err, result) {
        var newResult = {};
        newResult.entrustuser = user.entrustuser;
        newResult.matchedCount = result.matchedCount;
        newResult.modifiedCount = result.modifiedCount;
        newResult.upsertedCount = result.upsertedId ? 1 : 0;
        if (flag && result.modifiedCount === 1) {
            collection.updateOne({
                'entrustuser': user.entrustuser,
                'itrustinfo.processed': {
                    $exists: true
                }
            }, {
                $set: {
                    'itrustinfo.processed': false
                }
            }, function () {
                collection.updateOne({
                    'entrustuser': user.entrustuser
                }, {
                    $push: {
                        logs: utilRef.ts() + 'Document updated from eDir'
                    }
                }, function () {
                    cb(err, result);
                });
            });

        } else {
            cb(err, result);
        }
    });
}