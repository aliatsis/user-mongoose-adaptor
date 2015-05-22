var mongoose = require("mongoose");
var Promise = require("es6-promise").Promise;
var extend = require('extend');
var log = require('bunyan').createLogger({
    name: 'userbase-mongoose-adaptor'
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

function toObject(document, includedFields, excludedFields) {
    var obj = document.toObject({
        versionKey: false
    });
    var result = {};

    Object.keys(obj).forEach(function(field) {
        var include = true;

        if (includedFields) {
            include = includedFields.indexOf(field) > -1;
        } else if (excludedFields) {
            include = excludedFields.indexOf(field) === -1;
        }

        if (include) {
            result[field] = obj[field];
        }
    });

    return result;
}

function serialize(options, user) {
    var result = toObject(user, options.includedFields, options.excludedFields);

    if (result[options.profileField]) {
        result[options.profileField] = getProfile(options, user);
    }

    result.id = user._id; // add id

    return result;
}

function getProfile(options, user) {
    return toObject(user[options.profileField], options.includedProfileFields, options.excludedProfileFields);
}

function getUserField(fieldName, user) {
    return user.get(fieldName);
}

function parseProps(changes, UserModel, options) {
    var userSchema = UserModel.schema;
    var result = {};

    result[options.profileField] = {};

    if (props) {
        Object.keys(props).forEach(function(key) {
            // kinda crappy way of doing this
            // the changes come in a format that should correspond
            // directly to the adapator option names {key}Field (e.g. {loginAttempts}Field)
            var propName = options[key + 'Field'] || key;

            if (userSchema.path(propName)) {
                result[propName] = props[key];
            } else if (userSchema.path(options.profileField + '.' + propName)) {
                result[options.profileField][propName] = props[key];
            }
        });
    }

    return result;
}

function create(UserModel, options, props) {
    var schemaProps = parseProps(props, UserModel, options);
    return new UserModel(schemaProps).save();
}

function update(UserModel, options, user, changes) {
    if (changes) {
        user.set(parseProps(changes, UserModel, options));
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

        queryParameters[options.profileField + '.' + options.usernameField] = username;

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

    if (schema.nested[options.profileField]) {
        if (!schema.path(options.profileField + '.' + options.usernameField)) {
            throw new Error('MissingUsernameInProfileError');
        }

        if (!schema.path(options.profileField + '.' + options.emailField)) {
            throw new Error('MissingEmailInProfileError');
        }
    } else {
        throw new Error('MissingUserProfileError');
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
        getProfile: getProfile.bind(null, options),
        serialize: serialize.bind(null, options),
        create: create.bind(null, UserModel, options),
        update: update.bind(null, UserModel, options),
        updateProfile: update.bind(null, UserModel, options)
    };
};