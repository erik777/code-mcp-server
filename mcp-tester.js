#!/usr/bin/env node

/**
 * MCP Protocol Tester
 * 
 * Simulates ChatGPT Deep Research client behavior to test MCP server compliance
 * without consuming OpenAI quota. Tests the complete MCP handshake and tool usage.
 */

const { randomUUID } = require('crypto');
const { EventEmitter } = require('events');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        url: 'http://localhost:3131/mcp',
        token: null,
        sessionId: randomUUID(),
        tool: null,
        query: null,
        timeout: 5000
    };

    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];

        switch (flag) {
            case '--url':
                config.url = value;
                break;
            case '--token':
                config.token = value;
                break;
            case '--session-id':
                config.sessionId = value;
                break;
            case '--tool':
                config.tool = value;
                break;
            case '--query':
                config.query = value;
                break;
            case '--timeout':
                config.timeout = parseInt(value, 10);
                break;
            default:
                if (flag.startsWith('--')) {
                    console.error(`Unknown flag: ${flag}`);
                    process.exit(1);
                }
        }
    }

    if (!config.token) {
        console.error('❌ ERROR: --token is required for authorization');
        console.log('\nUsage:');
        console.log('  node mcp-tester.js --url <url> --token <bearer-token> [options]');
        console.log('\nOptions:');
        console.log('  --session-id <id>    Custom session ID (default: random UUID)');
        console.log('  --tool <name>        Tool to invoke (e.g. "search")');
        console.log('  --query <text>       Query for search tool');
        console.log('  --timeout <ms>       Stream timeout (default: 5000)');
        process.exit(1);
    }

    return config;
}

// HTTP request helper with proper error handling
async function makeRequest(url, options) {
    const { default: fetch } = await
    import ('node-fetch');

    try {
        const response = await fetch(url, options);
        const responseText = await response.text();

        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
            text: responseText
        };
    } catch (error) {
        throw new Error(`Network error: ${error.message}`);
    }
}

// SSE stream parser
class SSEParser extends EventEmitter {
    constructor() {
        super();
        this.buffer = '';
    }

    write(chunk) {
        this.buffer += chunk;
        this.processBuffer();
    }

    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let event = {};

        for (const line of lines) {
            if (line === '') {
                // Empty line indicates end of event
                if (Object.keys(event).length > 0) {
                    this.emit('event', event);
                    event = {};
                }
            } else if (line.startsWith('event:')) {
                event.type = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                const data = line.slice(5).trim();
                if (event.data) {
                    event.data += '\n' + data;
                } else {
                    event.data = data;
                }
            } else if (line.startsWith('id:')) {
                event.id = line.slice(3).trim();
            } else if (line.startsWith('retry:')) {
                event.retry = parseInt(line.slice(6).trim(), 10);
            }
        }
    }

    end() {
        // Process any remaining data
        if (this.buffer.trim()) {
            this.processBuffer();
        }
        this.emit('end');
    }
}

// Main testing function
async function testMCPProtocol(config) {
    console.log('🧪 MCP Protocol Tester');
    console.log('======================');
    console.log(`📍 Server URL: ${config.url}`);
    console.log(`🆔 Session ID: ${config.sessionId}`);
    console.log(`🔧 Tool: ${config.tool || 'none'}`);
    console.log(`⏱️  Timeout: ${config.timeout}ms`);
    console.log('');

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${config.token}`,
        'mcp-session-id': config.sessionId,
        'User-Agent': 'mcp-tester/1.0.0'
    };

    let requestId = 1;
    const results = {
        initialize: null,
        toolsList: null,
        toolCall: null,
        sseStream: null,
        success: false
    };

    try {
        // Phase 1: Initialize MCP connection
        console.log('🚀 Phase 1: Initialize MCP Connection');
        console.log('=====================================');

        const initRequest = {
            jsonrpc: '2.0',
            id: requestId++,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                capabilities: {
                    tools: {}
                },
                clientInfo: {
                    name: 'mcp-tester',
                    version: '1.0.0'
                }
            }
        };

        console.log(`📤 POST ${config.url}`);
        console.log(`📋 Headers: ${JSON.stringify(headers, null, 2)}`);
        console.log(`📦 Body: ${JSON.stringify(initRequest, null, 2)}`);

        const initResponse = await makeRequest(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(initRequest)
        });

        console.log(`📨 Response: ${initResponse.status} ${initResponse.statusText}`);
        console.log(`📄 Body: ${JSON.stringify(initResponse.data, null, 2)}`);

        if (!initResponse.ok) {
            throw new Error(`Initialize failed: ${initResponse.status} ${initResponse.statusText}`);
        }

        results.initialize = initResponse.data;
        console.log('✅ Initialize successful');
        console.log('');

        // Phase 2: Send initialized notification
        console.log('📡 Phase 2: Send Initialized Notification');
        console.log('=========================================');

        const notifyRequest = {
            jsonrpc: '2.0',
            method: 'notifications/initialized'
        };

        console.log(`📤 POST ${config.url}`);
        console.log(`📦 Body: ${JSON.stringify(notifyRequest, null, 2)}`);

        const notifyResponse = await makeRequest(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(notifyRequest)
        });

        console.log(`📨 Response: ${notifyResponse.status} ${notifyResponse.statusText}`);
        if (notifyResponse.text) {
            console.log(`📄 Body: ${notifyResponse.text}`);
        }
        console.log('✅ Notification sent');
        console.log('');

        // Phase 3: List available tools
        console.log('🔧 Phase 3: List Available Tools');
        console.log('================================');

        const toolsRequest = {
            jsonrpc: '2.0',
            id: requestId++,
            method: 'tools/list'
        };

        console.log(`📤 POST ${config.url}`);
        console.log(`📦 Body: ${JSON.stringify(toolsRequest, null, 2)}`);

        const toolsResponse = await makeRequest(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(toolsRequest)
        });

        console.log(`📨 Response: ${toolsResponse.status} ${toolsResponse.statusText}`);
        console.log(`📄 Body: ${JSON.stringify(toolsResponse.data, null, 2)}`);

        if (!toolsResponse.ok) {
            console.log('⚠️  Tools list failed, but continuing...');
        }

        results.toolsList = toolsResponse.data;
        console.log('✅ Tools list retrieved');
        console.log('');

        // Phase 4: Call specific tool if requested
        if (config.tool) {
            console.log(`🛠️  Phase 4: Call Tool "${config.tool}"`);
            console.log('============================');

            const toolParams = {};
            if (config.tool === 'search' && config.query) {
                toolParams.query = config.query;
            }

            const toolRequest = {
                jsonrpc: '2.0',
                id: requestId++,
                method: 'tools/call',
                params: {
                    name: config.tool,
                    arguments: toolParams
                }
            };

            console.log(`📤 POST ${config.url}`);
            console.log(`📦 Body: ${JSON.stringify(toolRequest, null, 2)}`);

            const toolResponse = await makeRequest(config.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(toolRequest)
            });

            console.log(`📨 Response: ${toolResponse.status} ${toolResponse.statusText}`);
            console.log(`📄 Body: ${JSON.stringify(toolResponse.data, null, 2)}`);

            results.toolCall = toolResponse.data;

            if (toolResponse.ok) {
                console.log('✅ Tool call successful');
            } else {
                console.log('⚠️  Tool call failed, but continuing...');
            }
            console.log('');
        }

        // Phase 5: Open SSE stream
        console.log('🌊 Phase 5: Open SSE Stream');
        console.log('===========================');

        const sseHeaders = {
            'Accept': 'text/event-stream',
            'Authorization': headers.Authorization,
            'mcp-session-id': headers['mcp-session-id'],
            'Cache-Control': 'no-store',
            'User-Agent': headers['User-Agent']
        };

        console.log(`📤 GET ${config.url}`);
        console.log(`📋 Headers: ${JSON.stringify(sseHeaders, null, 2)}`);

        const sseResponse = await fetch(config.url, {
            method: 'GET',
            headers: sseHeaders
        });

        console.log(`📨 Response: ${sseResponse.status} ${sseResponse.statusText}`);
        console.log(`📋 Response Headers: ${JSON.stringify(Object.fromEntries(sseResponse.headers.entries()), null, 2)}`);

        if (!sseResponse.ok) {
            throw new Error(`SSE stream failed: ${sseResponse.status} ${sseResponse.statusText}`);
        }

        // Parse SSE stream
        const parser = new SSEParser();
        let streamEnded = false;
        let timeoutHandle;

        return new Promise((resolve, reject) => {
            timeoutHandle = setTimeout(() => {
                if (!streamEnded) {
                    console.log(`⏰ Stream timeout after ${config.timeout}ms`);
                    sseResponse.body.destroy();
                    reject(new Error('Stream timeout'));
                }
            }, config.timeout);

            parser.on('event', (event) => {
                console.log(`📨 SSE Event: ${event.type || 'message'}`);
                if (event.id) console.log(`🆔 Event ID: ${event.id}`);
                if (event.data) {
                    console.log(`📄 Data: ${event.data}`);

                    // Try to parse JSON data
                    try {
                        const parsedData = JSON.parse(event.data);
                        console.log(`📊 Parsed: ${JSON.stringify(parsedData, null, 2)}`);
                    } catch {
                        // Not JSON, that's fine
                    }
                }

                if (event.type === 'done') {
                    console.log('✅ Stream completed with done event');
                    streamEnded = true;
                    clearTimeout(timeoutHandle);
                    results.sseStream = 'completed';
                    results.success = true;
                    resolve(results);
                }
            });

            parser.on('end', () => {
                if (!streamEnded) {
                    console.log('📡 Stream ended');
                    streamEnded = true;
                    clearTimeout(timeoutHandle);
                    results.sseStream = 'ended';
                    results.success = true;
                    resolve(results);
                }
            });

            sseResponse.body.on('data', (chunk) => {
                const chunkStr = chunk.toString();
                console.log(`📥 Chunk: ${JSON.stringify(chunkStr)}`);
                parser.write(chunkStr);
            });

            sseResponse.body.on('end', () => {
                parser.end();
            });

            sseResponse.body.on('error', (error) => {
                console.log(`❌ Stream error: ${error.message}`);
                clearTimeout(timeoutHandle);
                reject(error);
            });
        });

    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        throw error;
    }
}

// Main execution
async function main() {
    const config = parseArgs();

    try {
        const results = await testMCPProtocol(config);

        console.log('');
        console.log('📊 Test Results Summary');
        console.log('======================');
        console.log(`✅ Initialize: ${results.initialize ? 'SUCCESS' : 'FAILED'}`);
        console.log(`✅ Tools List: ${results.toolsList ? 'SUCCESS' : 'FAILED'}`);
        console.log(`✅ Tool Call: ${results.toolCall ? 'SUCCESS' : config.tool ? 'FAILED' : 'SKIPPED'}`);
        console.log(`✅ SSE Stream: ${results.sseStream || 'FAILED'}`);
        console.log(`🎯 Overall: ${results.success ? 'SUCCESS' : 'FAILED'}`);

        process.exit(results.success ? 0 : 1);

    } catch (error) {
        console.log('');
        console.log('💥 Test Failed');
        console.log('==============');
        console.log(`❌ Error: ${error.message}`);
        console.log('');

        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the main function
if (require.main === module) {
    main();
}

module.exports = { testMCPProtocol, parseArgs };