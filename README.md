# Code MCP Server

This is a lightweight MCP-style HTTP server for exposing a local Git repo to LLMs like ChatGPT, Codex, or agentic systems. It provides a read-only API to browse, query, and fetch code context.

## Features

- List all files in the mounted repo
- Fetch any file's contents by path
- Search for keywords across the entire repo (case-insensitive)
- Dockerized and safe by default (read-only volume)

## Getting Started

### 1. Clone this Repo

```bash
git clone https://github.com/erik777/code-mcp-server
cd code-mcp-server

## Build the dockr

```bash
docker build -t code-mcp-server .
```

## Running with Docker

To launch the gateway in a container, mount your local Git repo:

```bash
REPO=/your/local/codebase

docker run --rm -p 3131:3131 \
  -v ${REPO}:/app/repo:ro \
  code-mcp-server

## Using the API

GET /files — Lists all repo files

GET /file/:path — Gets contents of a file

POST /search with { "query": "keyword" } — Returns line-level matches

Environment Variables
REPO_PATH (default /app/repo) — Override mounted repo path

PORT (default 3131)
