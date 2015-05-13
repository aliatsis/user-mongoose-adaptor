var mongoose = require("mongoose");
var Promise = require("es6-promise").Promise;
var extend = require('extend');
var log = require('bunyan').createLogger({
    name: 'user-mongoose-adaptor'
});

module.exports = {
    schemaPlugin: function(schema, options) {
        var options = processOptions(userOptions);
        schema.add(processSchemaFields(schema, options));
        extend(schema.methods, getMethods(options));
        extend(schema.statics, getStatics(options));
    },
    create: function(UserModel, options) {
        var options = processOptions(userOptions);

        return {
            connect: function() {
                return new Promise(function(resolve, reject) {
                    log.info('Try connecting to mongodb');

                    mongoose.connect(options.mongoURI, options.mongoOptions,
                        function(err) {
                            if (err) {
                                log.info('Error connecting to mongodb:', err);
                                reject(err);
                            } else {
                                log.info('Connected to mongodb');
                                resolve();
                            }
                        }
                    );
                });
            },
            findById: function(id) {
                return UserModel.findById(id);
            },
            findByUsername: function(username) {
                return UserModel.findByUsername(username);
            },
            serialize: function(user) {
                return user.serialize();
            },
            getId: function(user) {
                return user.id;
            },
            getSalt: function(user) {
                return user[options.saltField];
            },
            getHash: function(user) {
                return user[options.hashField];
            },
            getLoginAttempts: function(user) {
                return user[options.loginAttemptsField];
            },
            getLoginAttemptLockTime: function(user) {
                return user[options.loginAttemptLockTimeField];
            },
            create: function(props) {
                return new UserModel(props).save();
            },
            update: function(user, changes) {
                if (changes) {
                    var keys = Object.keys(changes);

                    if (keys.length) {
                        keys.forEach(function(key) {
                            user[key] = changes[key];
                        });

                        return user.save();
                    }
                }

                return Promise.resolve(user);
            }
        };
    }
};

function processOptions(options) {
    if (!options.mongoURI) {
        throw new Error('MissingMongoURIError');
    }

    options.includedFields = options.includedFields || [];
    options.excludedFields = options.excludedFields || [];
    options.usernameUnique = options.usernameUnique === false || true;
    options.usernameLowerCase = options.usernameLowerCase === false || true;

    options.usernameField = options.usernameField || 'username';
    options.hashField = options.hashField || 'hash';
    options.saltField = options.saltField || 'salt';
    options.lastLoginField = options.lastLoginField || 'lastLogin';
    options.lastLogoutField = options.lastLogoutField || 'lastLogout';
    options.loginAttemptsField = options.loginAttemptsField || 'loginAttempts';
    options.loginAttemptLockTimeField = options.loginAttemptLockTimeField || 'loginAttemptLockTime';
}

function processSchemaFields(schema, options) {
    if (!schema) {
        throw new Error('MissingSchemaError');
    }

    var schemaFields = {};

    if (!schema.path(options.usernameField)) {
        schemaFields[options.usernameField] = {
            type: String,
            trim: true,
            unique: !!options.usernameUnique,
            lowercase: !!options.usernameLowerCase
        };
    }

    schemaFields[options.hashField] = String;
    schemaFields[options.saltField] = String;
    schemaFields[options.lastLoginField] = Number;
    schemaFields[options.lastLogoutField] = Number;

    if (options.limitAttempts) {
        schemaFields[options.loginAttemptsField] = {
            type: Number,
            default: 0
        };

        schemaFields[options.loginAttemptLockTimeField] = {
            type: Number
        };
    }

    return schemaFields;
}

function getMethods(options) {
    var methods = {};

    methods.serialize = function() {
        return this.toObject({
            transform: function(doc, ret) {
                var result = {
                    id: ret._id
                };

                Object.keys(ret).forEach(function(field) {
                    var include = true;

                    if (options.includedFields) {
                        include = options.includedFields.indexOf(field) > -1;
                    } else if (options.excludedFields) {
                        include = options.excludedFields.indexOf(field) === -1;
                    }

                    if (include) {
                        result[field] = ret[field];
                    }
                });

                return result;
            },
            versionKey: false
        });
    };

    return methods;
}

function getStatics(options) {
    var statics = {};

    statics.findByUsername = function(username) {
        var queryParameters = {};

        // if specified, convert the username to lowercase
        if (username && options.usernameLowerCase) {
            username = username.toLowerCase();
        }

        queryParameters[options.usernameField] = username;
        return this.findOne(queryParameters);
    };

    return statics;
}