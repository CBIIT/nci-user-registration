var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var db;
var confirmTimeout;
var loggerRef;
var usersCollection;
var utilRef;

module.exports = {
    connect: function (logger, config, util, cb) {
        logger.info('Connecting to database...');
        confirmTimeout = config.confirm.timeout;
        loggerRef = logger;
        utilRef = util;
        usersCollection = config.db.users_collection;
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
        collection.insertMany(users, function (err, results) {
            cb(err, results);
        });
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

    userCount: function (cb) {
        var collection = db.collection(usersCollection);

        collection.count(function (err, count) {
            return cb(err, count);
        });
    },
    externalUserCount: function (cb) {
        var collection = db.collection(usersCollection);

        collection.count({
            groupMembership: 'cn=eDir Migration Federated Users,ou=SVCS,o=NIH'
        }, function (err, count) {
            return cb(err, count);
        });
    },
    selfRegisteredCount: function (cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            itrustinfo: 1
        }, function (err, count) {
            return cb(err, count);
        });
    },
    processedCount: function (cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            itrustinfo: {
                updated: true
            }
        }, function (err, count) {
            return cb(err, count);
        });
    }
};