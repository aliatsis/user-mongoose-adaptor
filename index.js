var mongoose = require("mongoose");
var Promise = require("es6-promise").Promise;
var extend = require('extend');
var log = require('bunyan').createLogger({
    name: 'user-mongoose-adaptor'
});

var defaultOptions = require('./defaultOptions');

///////////////////////////
//        HELPERS        //
///////////////////////////

function schemaPlugin(schema, options) {
    options = processOptions(options);
    schema.add(processSchemaFields(schema, options));
}

function connect(options) {
    return new Promise(function(resolve, reject) {
        log.info('Try connecting to mongodb');

        mongoose.connect(options.mongoURI, options.mongoOptions);

        mongoose.connection.once('open', function(err) {
            if (err) {
                log.info('Error connecting to mongodb:', err);
                reject(err);
            } else {
                log.info('Connected to mongodb');
                resolve();
            }
        });

        mongoose.connection.on('error', function(err) {
            console.error('MongoDB error: %s', err);
        });
    });
}

function findById(id) {
    var self = this;

    return new Promise(function(resolve, reject) {
        self.findById(id, function(err, user) {
            if (err) {
                reject(err);
            } else {
                resolve(user);
            }
        });
    });
}

function serialize(options, user) {
    return user.toObject({
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
}

function getUserField(fieldName, user) {
    return user.get(fieldName);
}

function parseChanges(changes, options) {
    var result = {};

    Object.keys(changes).forEach(function(key) {
        // kinda crappy way of doing this
        // the changes come in a format that should correspond
        // directly to the adapator option names {key}Field (e.g. {loginAttempts}Field)
        result[options[key + 'Field']] = changes[key];
    });

    return result;
}

function create(UserModel, props) {
    return new UserModel(props).save();
}

function update(options, user, changes) {
    if (changes) {
        user.set(parseChanges(changes, options));
        return user.save();
    }

    return Promise.resolve(user);
}

function findByUsername(options, username) {
    var self = this;

    return new Promise(function(resolve, reject) {
        var queryParameters = {};

        // if specified, convert the username to lowercase
        if (username && options.usernameLowerCase) {
            username = username.toLowerCase();
        }

        queryParameters[options.usernameField] = username;

        self.findOne(queryParameters, function(err, user) {
            if (err) {
                reject(err);
            } else {
                resolve(user);
            }
        });
    });
}

function processOptions(options) {
    if (!options.mongoURI) {
        throw new Error('MissingMongoURIError');
    }

    return extend({}, defaultOptions, options);
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

    if (options.limitLoginAttempts) {
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

///////////////////////////
//        PUBLIC         //
///////////////////////////

module.exports = function(UserModel, options) {
    options = processOptions(options);

    UserModel.schema.plugin(schemaPlugin, options);

    return {
        connect: connect.bind(null, options),
        findById: findById.bind(UserModel),
        findByUsername: findByUsername.bind(UserModel, options),
        getId: getUserField.bind(null, 'id'),
        getSalt: getUserField.bind(null, options.saltField),
        getHash: getUserField.bind(null, options.hashField),
        getLoginAttempts: getUserField.bind(null, options.loginAttemptsField),
        getLoginAttemptLockTime: getUserField.bind(null, options.loginAttemptLockTimeField),
        getLastLogin: getUserField.bind(null, options.lastLoginField),
        getLastLogout: getUserField.bind(null, options.lastLogoutField),
        serialize: serialize.bind(null, options),
        create: create.bind(null, UserModel),
        update: update.bind(null, options)
    };
};