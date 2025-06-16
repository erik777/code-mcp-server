## Running with Docker

To launch the gateway in a container, mount your local Git repo:

```bash
docker build -t code-mcp-server .

docker run --rm -p 3131:3131 \
  -v $(pwd)/your-repo:/app/repo:ro \
  code-mcp-server
