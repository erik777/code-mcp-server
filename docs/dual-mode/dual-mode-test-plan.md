# MCP Server Dual-Mode Testing Plan

**Date**: Step 2+ of Dual-Mode Refactor  
**Purpose**: Strategic testing approach for dual-mode implementation with Deep Research quota constraints  
**Status**: 🧪 **ACTIVE TESTING PLAN** - Update as plan evolves

---

## Overview

This document outlines the testing strategy for the dual-mode MCP server refactor, designed to minimize Deep Research quota usage while ensuring comprehensive validation of both ChatGPT compatibility and authentication functionality.

## 🚨 **Critical Constraint: Deep Research Quota**

- **Monthly Limit**: 25 Deep Research queries
- **Daily Strategy**: Maximum 1 Deep Research test per day
- **Cost**: Each test is precious - must be used strategically
- **Implication**: Extensive local testing required before Deep Research validation

---

## 🎯 **Testing Hierarchy (Preserve Deep Research Quota)**

### **Tier 1: Local Validation** (Unlimited)
- `mcp-tester.js` automated testing
- `curl` and Postman HTTP testing
- Unit tests and integration tests
- Configuration validation
- Error condition testing

### **Tier 2: Log Monitoring Sessions** (Unlimited)
- Regular ChatGPT interactions (not Deep Research)
- Real-time server log analysis
- Performance monitoring
- Error pattern identification
- Request/response flow validation

### **Tier 3: Deep Research Validation** (25/month - PRECIOUS)
- Final milestone confirmations
- Production-ready validation
- Regression testing of critical functionality
- Ultimate ChatGPT compatibility verification

---

## 📋 **Phase-by-Phase Testing Strategy**

### **Phase 1: Local Development Testing**

**Objective**: Validate all functionality locally before any ChatGPT testing

#### **Tools & Methods**
```bash
# MCP Tester (Primary validation tool)
node mcp-tester.js

# Mode-specific testing
USE_STANDARD=false ENABLE_AUTH=false node mcp-tester.js
USE_STANDARD=false ENABLE_AUTH=true OAUTH_TOKEN=<token> node mcp-tester.js
USE_STANDARD=true ENABLE_AUTH=false node mcp-tester.js
USE_STANDARD=true ENABLE_AUTH=true OAUTH_TOKEN=<token> node mcp-tester.js

# HTTP Testing
curl -X POST http://localhost:3131/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

# Authentication Testing (when enabled)
curl -X POST http://localhost:3131/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

#### **Test Scenarios**
- [ ] **Bootstrap Mode Selection**: Verify `USE_STANDARD` correctly selects mode
- [ ] **Authentication Toggle**: Verify `ENABLE_AUTH` enables/disables auth
- [ ] **MCP Protocol**: Test `initialize`, `tools/list`, `tools/call`
- [ ] **Tool Functionality**: Test `search` and `fetch` tools
- [ ] **Error Handling**: Test malformed requests, missing auth, invalid tokens
- [ ] **Configuration**: Test all environment variable combinations
- [ ] **Startup Logging**: Verify correct boot mode messages

### **Phase 2: Log Monitoring Sessions**

**Objective**: Validate real ChatGPT interaction patterns without using Deep Research quota

#### **Process**
1. **Start Server**: With appropriate mode configuration
2. **Monitor Logs**: Real-time log watching (Claude monitors)
3. **ChatGPT Interaction**: Regular chat interactions with MCP (not Deep Research)
4. **Analysis**: Identify issues, patterns, performance concerns
5. **Iteration**: Fix issues and repeat

#### **What to Monitor**
```bash
# Log monitoring setup
tail -f server.log | grep -E "(ERROR|WARN|🚨|❌|✅)"

# Key metrics to track:
# - Request timing
# - Response size
# - Error frequency
# - Authentication flow
# - Tool execution time
# - Memory usage patterns
```

#### **Test Interactions**
- [ ] **Basic MCP Connection**: ChatGPT connects to server
- [ ] **Tool Discovery**: ChatGPT discovers available tools
- [ ] **Simple Tool Calls**: Basic `search` and `fetch` operations
- [ ] **Complex Queries**: Multi-step tool interactions
- [ ] **Error Recovery**: How ChatGPT handles server errors
- [ ] **Session Management**: Connection lifecycle behavior

### **Phase 3: Deep Research Validation** (PRECIOUS QUOTA)

**Objective**: Final validation of ChatGPT Deep Research compatibility

#### **Pre-Deep Research Checklist**

**MUST COMPLETE BEFORE USING DEEP RESEARCH QUOTA**:

##### **Local Testing Complete**
- [ ] All `mcp-tester.js` scenarios pass
- [ ] Manual curl tests work correctly
- [ ] All four mode combinations tested locally
- [ ] Error handling validated
- [ ] Performance benchmarks acceptable
- [ ] Configuration toggles working

##### **Log Monitoring Complete**
- [ ] Regular ChatGPT interactions tested successfully
- [ ] Server-side behavior looks correct
- [ ] No unexpected errors or warnings
- [ ] Response timing within acceptable range
- [ ] Authentication flow working (if enabled)

##### **Documentation Complete**
- [ ] Test results documented
- [ ] Known issues identified and addressed
- [ ] Configuration validated
- [ ] Regression tests pass

#### **Deep Research Test Session Plan**

**Each Deep Research session should test multiple scenarios to maximize value**:

##### **Session 1: Baseline Validation**
```bash
# Configuration
USE_STANDARD=false
ENABLE_AUTH=false
```

**Test Sequence**:
1. **Connection Test**: Verify ChatGPT can connect to server  
2. **Tool Discovery**: Confirm tools are discovered correctly
3. **Simple Search**: Test basic `search` functionality
4. **Simple Fetch**: Test basic `fetch` functionality  
5. **Complex Query**: Multi-step research query
6. **Error Handling**: Test server error recovery

**Success Criteria**:
- [ ] Deep Research completes successfully
- [ ] All tool calls work as expected
- [ ] Response format acceptable to ChatGPT
- [ ] Performance within acceptable range
- [ ] No server errors or crashes

##### **Session 2: Authentication Validation**
```bash
# Configuration  
USE_STANDARD=false
ENABLE_AUTH=true
OAUTH_TOKEN=<pre-obtained-token>
```

**Test Sequence**:
1. **Authenticated Connection**: Verify ChatGPT can connect with auth
2. **Tool Discovery**: Confirm tools available with authentication
3. **Authenticated Search**: Test `search` with Bearer token
4. **Authenticated Fetch**: Test `fetch` with Bearer token
5. **Complex Authenticated Query**: Multi-step research with auth
6. **Auth Error Handling**: Test invalid/missing token scenarios

**Success Criteria**:
- [ ] Deep Research works with authentication
- [ ] Bearer token authentication doesn't break ChatGPT compatibility
- [ ] All authenticated tool calls work
- [ ] Auth error handling graceful
- [ ] No authentication-related ChatGPT issues

##### **Session 3: Regression Testing** (if needed)
**Use only if significant changes made after Sessions 1 & 2**

**Test Sequence**:
1. **Baseline Regression**: Verify original functionality still works
2. **New Feature Validation**: Test any new functionality
3. **Configuration Regression**: Test different env var combinations
4. **Performance Regression**: Verify performance hasn't degraded

---

## 🔍 **Monitoring & Analysis**

### **Real-Time Log Analysis** (Claude's Role)

During ChatGPT testing sessions, monitor for:

#### **Performance Metrics**
```bash
# Response time patterns
grep "response sent" server.log | tail -20

# Error frequency
grep -c "ERROR\|❌" server.log

# Authentication success/failure
grep "Auth" server.log | tail -10

# Tool execution timing
grep "Tool.*completed" server.log | tail -10
```

#### **Request/Response Patterns**
- **Request Format**: Verify ChatGPT sends expected JSON-RPC
- **Response Format**: Verify server returns ChatGPT-compatible responses
- **Header Handling**: Check Content-Type, Authorization headers
- **Error Responses**: Validate error format and codes

#### **Authentication Flow Analysis**
```bash
# Bearer token validation
grep "Bearer.*token" server.log

# Authentication failures
grep "401\|403\|Authentication" server.log

# Token validation timing
grep "validateUser" server.log
```

### **Issue Tracking**

#### **Critical Issues** (Block Deep Research testing)
- Server crashes or hangs
- Authentication completely broken
- Tools not working locally
- Configuration issues

#### **Performance Issues** (Monitor during testing)
- Response times > 5 seconds
- Memory leaks
- High CPU usage
- Network timeout issues

#### **Compatibility Issues** (ChatGPT-specific)
- Response format rejected by ChatGPT
- Tool discovery failures
- Authentication flow breaks ChatGPT integration
- Error handling causes ChatGPT confusion

---

## 📊 **Testing Progress Tracking**

### **Checklist Format**

#### **Simple Mode + No Auth**
- [ ] **Local Testing**: `mcp-tester.js` passes
- [ ] **HTTP Testing**: `curl` tests pass
- [ ] **Log Monitoring**: Regular ChatGPT interaction successful
- [ ] **Deep Research**: ✅ Session 1 completed successfully

#### **Simple Mode + Auth**
- [ ] **Local Testing**: `mcp-tester.js` with auth passes
- [ ] **HTTP Testing**: `curl` with Bearer token passes
- [ ] **Log Monitoring**: Regular ChatGPT interaction with auth successful
- [ ] **Deep Research**: ✅ Session 2 completed successfully

#### **Standard Mode** (Future/Non-ChatGPT)
- [ ] **Local Testing**: `mcp-tester.js` passes
- [ ] **Streaming Testing**: SSE functionality works
- [ ] **Regression Testing**: No degradation from current implementation

### **Test Results Documentation**

For each Deep Research session, document:

```markdown
## Deep Research Session N - [Date]

**Configuration**:
- USE_STANDARD: [true/false]
- ENABLE_AUTH: [true/false]
- OAUTH_PROVIDER: [if applicable]

**Test Results**:
- Connection: [Success/Failure]
- Tool Discovery: [Success/Failure]  
- Search Tool: [Success/Failure]
- Fetch Tool: [Success/Failure]
- Complex Query: [Success/Failure]
- Error Handling: [Success/Failure]

**Performance**:
- Average Response Time: [Xs]
- Memory Usage: [XMB]
- Error Count: [X]

**Issues Identified**:
- [List any issues found]

**Next Steps**:
- [Actions to take based on results]
```

---

## 🚧 **Contingency Plans**

### **If Deep Research Test Fails**

1. **Don't Panic**: Failure is learning
2. **Document Everything**: Capture exact failure mode
3. **Return to Local Testing**: Fix issues locally first
4. **Log Monitoring**: Validate fix with regular ChatGPT
5. **Wait for Next Day**: Don't waste additional quota

### **If Running Low on Quota**

**Quota Preservation Strategies**:
- Use Deep Research only for final validation
- Batch multiple tests per session
- Focus on critical path functionality
- Document everything to avoid re-testing

### **If Major Architecture Changes Needed**

1. **Pause Deep Research Testing**: Preserve remaining quota
2. **Extensive Local Development**: Validate changes thoroughly
3. **Extended Log Monitoring**: Multiple sessions with regular ChatGPT
4. **Resume Deep Research**: Only when confident in changes

---

## 🎯 **Success Criteria**

### **Minimum Viable Success**
- [ ] Simple Mode + No Auth works with ChatGPT Deep Research
- [ ] Simple Mode + Auth works with ChatGPT Deep Research  
- [ ] No regression in existing functionality
- [ ] Configuration toggles work correctly

### **Optimal Success**
- [ ] All mode combinations work correctly
- [ ] Performance meets or exceeds baseline
- [ ] Authentication fully functional
- [ ] Comprehensive documentation complete
- [ ] Test suite covers all scenarios

---

**END OF TESTING PLAN**

*This plan prioritizes quota preservation while ensuring comprehensive validation. Update as testing progresses and requirements evolve.* 