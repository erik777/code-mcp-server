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

// Ensure repo exists
if (!fs.existsSync(REPO_PATH)) {
    console.error(`ERROR: Missing repo at ${REPO_PATH}. Please mount your Git repo.`);
    process.exit(1);
}

// List all files
app.get('/files', (req, res) => {
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
    const filePath = path.join(REPO_PATH, req.params[0]);
    if (!filePath.startsWith(REPO_PATH)) return res.status(400).send('Invalid path');
    fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) return res.status(404).send('File not found');
        res.send(content);
    });
});

// Keyword search
app.post('/search', (req, res) => {
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
    res.sendFile(path.join(__dirname, 'openapi.yaml'));
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`MCP Git Gateway running at http://localhost:${port}`);
});