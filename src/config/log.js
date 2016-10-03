var winston = require('winston');

var logFile = process.env.LOG_FILE;
var rotationSize = 100000000; // Bytes

var logger = new(winston.Logger)({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        new(winston.transports.Console)(),
        new(winston.transports.File)({
            filename: logFile,
            maxsize: rotationSize
        })
    ]
});

logger.info('Log level: ' + logger.level);

module.exports = logger;