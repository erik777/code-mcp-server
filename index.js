// Minimal MCP-style Git Gateway
// Stack: Node.js + Express + simple-git

const express = require('express');
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3131;
const REPO_PATH = process.env.REPO_PATH || path.resolve(__dirname, 'repo');
const git = simpleGit(REPO_PATH);

app.use(express.json());

// app.use((req, res, next) => {
//     console.log(`[UNHANDLED] ${req.method} ${req.originalUrl}`);
//     next();
// });

// logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Ensure repo exists
if (!fs.existsSync(REPO_PATH)) {
    console.error(`ERROR: Missing repo at ${REPO_PATH}. Please mount your Git repo.`);
    process.exit(1);
}

// List all files
app.get('/files', (req, res) => {
    console.log('[GET /files]');
    const walk = (dir) =>
        fs.readdirSync(dir).flatMap(file => {
            const fullPath = path.join(dir, file);
            return fs.statSync(fullPath).isDirectory() ?
                walk(fullPath) :
                fullPath.replace(REPO_PATH + path.sep, '');
        });
    res.json(walk(REPO_PATH));
});

// Get file content
app.get('/file/*', (req, res) => {
    console.log('[GET /file/*]');
    const filePath = path.join(REPO_PATH, req.params[0]);
    if (!filePath.startsWith(REPO_PATH)) return res.status(400).send('Invalid path');
    fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) return res.status(404).send('File not found');
        res.send(content);
    });
});

// Keyword search
app.post('/search', (req, res) => {
    console.log('[POST /search]');
    const { query } = req.body;
    if (!query) return res.status(400).send('Missing query');
    const results = [];

    const walk = (dir) =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
            const fullPath = path.join(dir, dirent.name);
            return dirent.isDirectory() ? walk(fullPath) : fullPath;
        });

    for (const file of walk(REPO_PATH)) {
        const content = fs.readFileSync(file, 'utf8');
        const relPath = file.replace(REPO_PATH + path.sep, '');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ file: relPath, line: i + 1, content: line });
            }
        });
    }
    res.json(results);
});

// Serve OpenAPI spec
app.get('/openapi', (req, res) => {
    console.log('[GET /openapi]');
    res.type('application/yaml').sendFile(path.join(__dirname, 'openapi.yaml'));
});

// Serve index.html
app.get('/', (req, res) => {
    console.log('[GET /]');
    // res.sendFile(path.join(__dirname, 'index.html'));
    res.send('MCP server is running.');
});

app.get('/status', (req, res) => {
    console.log('[GET /status]');
    res.json({
        status: 'ok',
        version: '1.0.0'
    });
});

app.get('/corsair/mcp1/status', (req, res) => {
    console.log('[GET /corsair/mcp1/status]');
    res.json({
        status: 'ok',
        version: '1.0.0'
    });
});

app.post('/', (req, res) => {
    const { jsonrpc, method, params, id } = req.body;

    console.log('[POST /] Headers:', req.headers);
    console.log('[POST /] Body:', JSON.stringify(req.body, null, 2));
    console.log('[POST /] method:', method);

    if (jsonrpc !== '2.0') {
        console.log('[POST /] INVALID jsonrpc:', jsonrpc);
        return res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Invalid Request' },
            id: null,
        });
    }

    if (method === 'initialize') {
        // Respond with server capabilities
        // protocolVersion: '2025-03-26' (must match the version of client request)
        return res.type('application/json').json({
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2025-03-26',
                serverInfo: {
                    name: 'Code MCP Gateway',
                    version: '1.0.0',
                },
                capabilities: {
                    tools: {
                        listChanged: true
                    },
                    resources: {
                        subscribe: true,
                        listChanged: true
                    },
                    prompts: {}
                }

            },
        });
    }

    if (method === 'files/list') {
        return res.json({
            jsonrpc: '2.0',
            id,
            result: [
                { path: 'README.md', size: 100, sha256: 'fakehash1' },
                { path: 'index.js', size: 250, sha256: 'fakehash2' }
            ],
        });
    }


    if (method === 'tools/list') {
        console.log('[POST /] tools/list');
        return res.json({
            jsonrpc: '2.0',
            id,
            result: [{
                name: 'example_tool',
                description: 'An example tool',
                parameters: {
                    type: 'object',
                    properties: {
                        input: {
                            type: 'string',
                            description: 'Input for the tool',
                        },
                    },
                    required: ['input'],
                },
            }, ],
        });
    }

    console.log('[POST /] Method not found:', method);

    // Handle other methods or return method not found
    return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id,
    });
});


// app.post('/', (req, res) => {
//     console.log('[POST /] Headers:', req.headers);
//     console.log('[POST /] Body:', JSON.stringify(req.body, null, 2));
//     res.status(200).send('OK');
// });

// start server
app.listen(port, () => {
    console.log(`MCP Git Gateway v1.0.0 running at http://localhost:${port}`);
});