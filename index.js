var mongoose = require('mongoose');
var extend = require('extend');
var log = require('./logger');

mongoose.Promise = global.Promise;

var pluginRegistered = false;

var defaultOptions = require('./defaultOptions');
var mainOptions = extend({}, defaultOptions);

///////////////////////////
//        HELPERS        //
///////////////////////////

function schemaPlugin(schema, options) {
  pluginRegistered = true;
  options = processOptions(options);
  schema.add(processSchemaFields(schema, options));
}

function connect(options) {
  return new Promise(function(resolve, reject) {
    log.info('Try connecting to mongodb');

    mongoose.connect(options.mongoURI, options.mongoOptions);

    mongoose.connection.once('open', function(err) {
      if (err) {
        log.error(err, 'Error connecting to mongodb');
        reject(err);
      } else {
        log.info('Connected to mongodb');
        resolve();
      }
    });

    mongoose.connection.on('error', function(err) {
      log.error(err, 'MongoDB error');
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

function getProfile(options, user) {
  if (typeof options.getPublicProfile === 'function') {
    return options.getPublicProfile(user);
  }

  var userObj = user.toObject({
    versionKey: false
  });

  var result = {};
  var obj = userObj.profile || {};

  Object.keys(obj).forEach(function(field) {
    var include = true;

    if (options.includedProfileFields) {
      include = !!~options.includedProfileFields.indexOf(field);
    } else if (options.excludedProfileFields) {
      include = !~options.excludedProfileFields.indexOf(field);
    }

    if (include) {
      result[field] = obj[field];
    }
  });

  return result;
}

function getUserField(fieldName, user) {
  return user.get(fieldName);
}

function parseProps(props, UserModel, options) {
  var userSchema = UserModel.schema;
  var result = {};

  result[options.profileField] = {};

  if (props) {
    Object.keys(props).forEach(function(key) {
      // kinda crappy way of doing this
      // the props come in a format that should correspond
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

  // wrap with native Promise until mongoose supports all features
  return new Promise(function(resolve, reject) {
    (new UserModel(schemaProps)).save().then(resolve, reject);
  });
}

function update(UserModel, options, user, changes) {
  if (changes) {
    var props = parseProps(changes, UserModel, options);
    var profileProps = props[options.profileField];
    var userProps = Object.keys(props).reduce(function(result, key) {
      if (key !== options.profileField) {
        result = result || {};
        result[key] = props[key];
      }

      return result;
    });

    // set the profile schema directly to not improperly overwrite
    if (profileProps) {
      user[options.profileField].set(profileProps);
    }

    if (userProps) {
      user.set(userProps);
    }

    // wrap with native Promise until mongoose supports all features
    return new Promise(function(resolve, reject) {
      user.save().then(resolve, reject);
    });
  }

  return Promise.resolve(user);
}

function findByField(options, field, isProfileField, value) {
  var self = this;

  return new Promise(function(resolve, reject) {
    var queryParameters = {};
    var fieldName = isProfileField ? options.profileField + '.' + field : field;

    queryParameters[fieldName] = value;

    self.findOne(queryParameters, function(err, user) {
      if (err) {
        reject(err);
      } else {
        resolve(user);
      }
    });
  });
}

function findByUsername(options, username) {
  // if specified, convert the username to lowercase
  if (username && options.usernameLowerCase) {
    username = username.toLowerCase();
  }

  return findByField.call(this, options, options.usernameField, true, username);
}

function processOptions(options, enforceMongoURI) {
  options = extend(mainOptions, options);

  if (enforceMongoURI && !options.mongoURI) {
    throw new Error('MissingMongoURIError');
  }

  return options;
}

function processSchemaFields(schema, options) {
  if (!schema) {
    throw new Error('MissingSchemaError');
  }

  var schemaFields = {};

  if (schema.path(options.profileField) || schema.nested[options.profileField]) {
    var profilePaths = {};

    if (!schema.path(options.profileField + '.' + options.usernameField)) {
      profilePaths[options.usernameField] = String;
    }

    if (!schema.path(options.profileField + '.' + options.emailField)) {
      profilePaths[options.emailField] = String;
    }

    if (options.googleIdField && !schema.path(options.profileField + '.' + options.googleIdField)) {
      profilePaths[options.googleIdField] = String;
    }

    if (options.facebookIdField && !schema.path(options.profileField + '.' + options.facebookIdField)) {
      profilePaths[options.facebookIdField] = String;
    }

    schemaFields[options.profileField] = profilePaths;
  } else {
    throw new Error('MissingUserProfileError');
  }


  schemaFields[options.hashField] = String;
  schemaFields[options.saltField] = String;
  schemaFields[options.resetPasswordHashField] = String;
  schemaFields[options.resetPasswordExpirationField] = Number;
  schemaFields[options.lastLoginField] = Number;
  schemaFields[options.lastLogoutField] = Number;
  schemaFields[options.signupDateField] = Number;

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
  options = processOptions(options, true);

  if (!pluginRegistered) {
    throw new Error('userbase-mongoose-adaptor: user schema plugin must be registered be the adaptor');
  }

  return {
    connect: connect.bind(null, options),
    findById: findById.bind(UserModel),
    findByUsername: findByUsername.bind(UserModel, options),
    findByEmail: findByField.bind(UserModel, options, options.emailField, true),
    findByGoogleId: findByField.bind(UserModel, options, options.googleIdField, true),
    findByFacebookId: findByField.bind(UserModel, options, options.facebookIdField, true),
    findByResetPasswordHash: findByField.bind(UserModel, options, options.resetPasswordHashField, false),
    getId: getUserField.bind(null, 'id'),
    getSalt: getUserField.bind(null, options.saltField),
    getHash: getUserField.bind(null, options.hashField),
    getLoginAttempts: getUserField.bind(null, options.loginAttemptsField),
    getLoginAttemptLockTime: getUserField.bind(null, options.loginAttemptLockTimeField),
    getLastLogin: getUserField.bind(null, options.lastLoginField),
    getLastLogout: getUserField.bind(null, options.lastLogoutField),
    getResetPasswordExpiration: getUserField.bind(null, options.resetPasswordExpirationField),
    getProfile: getProfile.bind(null, options),
    create: create.bind(null, UserModel, options),
    update: update.bind(null, UserModel, options),
    updateProfile: update.bind(null, UserModel, options)
  };
};

module.exports.userPlugin = schemaPlugin;