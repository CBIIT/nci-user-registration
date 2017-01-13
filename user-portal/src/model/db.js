var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var db;
var confirmTimeout;
var loggerRef;
var usersCollection;
var requestCollection;
var updatesCollection;
var utilRef;

module.exports = {
    connect: function (logger, config, util, cb) {
        logger.info('Connecting to database...');
        confirmTimeout = config.confirm.timeout;
        loggerRef = logger;
        utilRef = util;
        usersCollection = config.db.users_collection;
        requestCollection = config.db.request_collection;
        updatesCollection = config.db.updates_collection;
        MongoClient.connect(config.db.url, function (err, database) {
            if (err) {
                throw err;
            }
            db = database;
            cb();
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

    logWithDN: function (user_dn, message) {
        var collection = db.collection(usersCollection);
        collection.updateOne({
            'itrustinfo.sm_userdn': user_dn
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

    isSmUserDnRegistered(itrustInfo, cb) {
        var collection = db.collection(usersCollection);
        collection.count({
            'itrustinfo.sm_userdn': itrustInfo.sm_userdn
        }, function (err, result) {
            if (err) {
                loggerRef.error('Failed to get count of user_dn ' + itrustInfo.sm_userdn + ' mappings');
            }
            if (result === 0) {
                cb(err, false);
            } else {
                cb(err, true);
            }
        });

    },

    updateSSHPublicKey: function (user_dn, pubkeyInfo, cb) {
        var collection = db.collection(usersCollection);

        collection.updateOne({
            'itrustinfo.sm_userdn': user_dn
        }, {
            $set: {
                pubkeyinfo: pubkeyInfo
            }
        }, function (err, document) {
            if (err) {
                loggerRef.error('Failed to persist public key info for sm_userid' + user_dn);
            }
            cb(err, document);
        });
    },

    updateSSHPublicKeyNew: function (user_dn, publicKey, cb) {
        var collection = db.collection(updatesCollection);

        collection.updateOne({
            sm_userdn: user_dn,
            field: 'ssh_public_key'
        }, {
            $set: {
                public_key: publicKey,
                processed: false
            }
        }, {
            upsert: true
        }, function (err, result) {
            if (err) {
                loggerRef.error('Failed to persist public key info for sm_userid' + user_dn);
            }
            cb(err, result);
        });
    },


    recordAccessRequest: function (requestObject, cb) {
        var collection = db.collection(requestCollection);

        collection.insert(requestObject, function (err, result) {
            cb(err, result);
        });

    }
};