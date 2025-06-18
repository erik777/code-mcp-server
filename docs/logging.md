**MCP Logging System with Winston Integration**

**Objective**
Introduce a robust, configurable logging system for the MCP server using the `winston` logging library. The system will support an appender-style architecture similar to Java logging frameworks, enabling flexibility for console, plain file, and JSON-structured file logging.

---

**Integration Plan**

### 1. Add Winston as a Dependency

```bash
npm install winston
```

### 2. Directory Setup

* Create a `logs/` directory at the project root (if not present)
* Ensure write access for the running user

### 3. Create `src/logger.js`

Export a preconfigured Winston logger with the following behaviors:

* Console transport (colorized output)
* File transport (plain `.log` format)
* File transport (JSON `.json.log` format — initially **disabled** by default)

```js
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
```

### 4. Usage Example

Replace calls to `logWithTimestamp()` or `console.log()` with:

```js
const logger = require('./logger');

logger.info("MCP server starting");
logger.warn("User login failed", { email });
logger.error("Unhandled exception", { error });
```

---

**Configuration Options**

All configuration is controlled through environment variables:

| Variable         | Default | Description                                     |
| ---------------- | ------- | ----------------------------------------------- |
| `LOG_TO_CONSOLE` | `true`  | Set to `false` to disable console output        |
| `LOG_TO_FILE`    | `true`  | Set to `false` to disable `logs/mcp.log` output |
| `LOG_TO_JSON`    | `false` | Set to `true` to enable structured JSON logging |

Examples:

```bash
# Default: console + file
LOG_TO_CONSOLE=true LOG_TO_FILE=true LOG_TO_JSON=false npm start

# Only console
LOG_TO_CONSOLE=true LOG_TO_FILE=false npm start

# JSON logs only
LOG_TO_CONSOLE=false LOG_TO_FILE=false LOG_TO_JSON=true npm start
```

---

**Future Enhancements**

* Add a custom HTTP transport for sending structured logs to CrateDB
* Add daily rotation via `winston-daily-rotate-file`
* Expose CLI toggle to dynamically enable/disable log sinks

---

**Next Steps**

* Add `src/logger.js` to repo
* Replace all timestamped logging with `logger.*()` calls
* Add `logs/` to `.gitignore` if not already included
* Begin emitting logs during Mode bootstrap and tool execution
