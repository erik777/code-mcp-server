#!/bin/bash

# MCP Server Test Script
# This script demonstrates how to test your MCP server using the mcp-tester.js tool

set -e  # Exit on error

echo "🧪 MCP Server Test Suite"
echo "========================"
echo ""

# Check if server is running
if ! curl -s http://localhost:3131/health > /dev/null; then
    echo "❌ MCP server is not running on localhost:3131"
    echo "Please start the server first with: npm start"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Check for OAuth token
if [ -z "$MCP_TEST_TOKEN" ]; then
    echo "❌ MCP_TEST_TOKEN environment variable is required"
    echo ""
    echo "To get a token:"
    echo "1. Visit: http://localhost:3131/oauth/login"
    echo "2. Complete OAuth flow"
    echo "3. Extract token from browser network tab"
    echo "4. Export token: export MCP_TEST_TOKEN='your-token-here'"
    echo ""
    exit 1
fi

echo "✅ OAuth token provided"
echo ""

# Test 1: Basic protocol compliance
echo "🔍 Test 1: Basic Protocol Compliance"
echo "===================================="
node mcp-tester.js \
    --url "http://localhost:3131/mcp" \
    --token "$MCP_TEST_TOKEN" \
    --timeout 10000

if [ $? -eq 0 ]; then
    echo "✅ Basic protocol test: PASSED"
else
    echo "❌ Basic protocol test: FAILED"
    exit 1
fi

echo ""

# Test 2: Search tool functionality
echo "🔍 Test 2: Search Tool Functionality" 
echo "===================================="
node mcp-tester.js \
    --url "http://localhost:3131/mcp" \
    --token "$MCP_TEST_TOKEN" \
    --tool "search" \
    --query "package.json" \
    --timeout 15000

if [ $? -eq 0 ]; then
    echo "✅ Search tool test: PASSED"
else
    echo "❌ Search tool test: FAILED"
    exit 1
fi

echo ""

# Test 3: Fetch tool functionality
echo "🔍 Test 3: Fetch Tool Functionality"
echo "==================================="
node mcp-tester.js \
    --url "http://localhost:3131/mcp" \
    --token "$MCP_TEST_TOKEN" \
    --tool "fetch" \
    --timeout 15000

if [ $? -eq 0 ]; then
    echo "✅ Fetch tool test: PASSED"
else
    echo "❌ Fetch tool test: FAILED"
    exit 1
fi

echo ""
echo "🎉 All MCP tests passed!"
echo "========================"
echo ""
echo "Your MCP server is properly implementing the protocol and should work with ChatGPT Deep Research." 