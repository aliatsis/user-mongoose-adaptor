var bunyan = require('bunyan');
var PrettyStream = require('bunyan-prettystream');

var prettyStdOut = new PrettyStream();
prettyStdOut.pipe(process.stdout);

var logOptions = {
  name: 'userbase-mongoose-adaptor'
};

if (process.env.NODE_ENV === 'development') {
  logOptions.streams = [{
    level: 'debug',
    type: 'raw',
    stream: prettyStdOut
  }];
}

module.exports = bunyan.createLogger(logOptions);