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

    getUser: function (id, cb) {
        var collection = db.collection(usersCollection);
        collection.findOne({
            _id: id
        }, function (err, results) {
            cb(err, results);
        });
    },

    search: function (searchObject, cb) {
        var collection = db.collection(usersCollection);
        collection.find({
            extracted_dn_username: searchObject.cn ? searchObject.cn : {
                $regex: /.*/
            },
            mail: searchObject.email ? searchObject.email : {
                $regex: /.*/
            }
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

    insertUsers: function (users, cb) {
        var collection = db.collection(usersCollection);
        collection.insertMany(users, {
            ordered: false
        }, function (err, results) {
            cb();
        });
    },

    insertGroups: function (groups, cb) {
        var collection = db.collection(groupsCollection);
        collection.insertMany(groups, {
            ordered: false
        }, function (err, results) {
            cb();
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
            'itrustinfo.processed': false
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
            'itrustinfo': 1
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
        collection.updateOne({
            'name_lower': appObject.name_lower,
        }, {
            $set: {
                name: appObject.name,
                name_lower: appObject.name_lower,
                description: appObject.description
                    // read_groups: appObject.readGroups,
                    // write_groups: appObject.writeGroups,
                    // admin_groups: appObject.adminGroups
            }
        }, {
            upsert: true
        }, function (err) {
            if (err) {
                loggerRef.error('Failed to persist application ' + appObject.name);
            }
            cb(err);
        });
    },

    searchApp: function (searchObject, cb) {
        var collection = db.collection(appsCollection);
        var searchStr;
        if (searchObject.name_lower) {
            searchStr = searchObject.name_lower;
        } else {
            searchStr = /.*/;
        }

        collection.find({
            name_lower: {
                $regex: searchStr
            }
        }).toArray(
            function (err, results) {
                cb(err, results);
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

    getAllGroups: function (cb) {
        var collection = db.collection(groupsCollection);
        collection.find({}, {
            dn: 1
        }).toArray(function (err, results) {
            cb(err, results);
        });
    },

    addGroup(appId, groupSetName, groupDN, cb) {
        var collection = db.collection(appsCollection);

        collection.update({
            _id: appId
        }, {
            $addToSet: {
                [groupSetName]: groupDN
            }
        }, function (err) {
            cb(err);
        });
    },

    removeGroup(appId, groupSetName, groupDN, cb) {
        var collection = db.collection(appsCollection);

        collection.update({
            _id: appId
        }, {
            $pull: {
                [groupSetName]: groupDN
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