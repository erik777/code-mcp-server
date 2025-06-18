const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message, ...meta }) => {
            const details = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level.toUpperCase()}] ${message} ${details}`;
        })
    ),
    transports: []
});

// Enable console logging unless suppressed
if (process.env.LOG_TO_CONSOLE !== 'false') {
    logger.add(new transports.Console({
        format: format.combine(format.colorize(), format.simple())
    }));
}

// Enable plain file logging unless suppressed
if (process.env.LOG_TO_FILE !== 'false') {
    logger.add(new transports.File({
        filename: path.join(logDir, 'mcp.log')
    }));
}

// Enable structured JSON file logging if explicitly requested
if (process.env.LOG_TO_JSON === 'true') {
    logger.add(new transports.File({
        filename: path.join(logDir, 'mcp-structured.json.log'),
        format: format.json()
    }));
}

module.exports = logger;