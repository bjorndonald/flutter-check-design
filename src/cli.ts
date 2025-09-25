#!/usr/bin/env node
import { getServerConfig } from "./config.js";
import { startHttpServer, startMcpServer } from "./server.js";


async function startServer(): Promise<void> {
    const config = getServerConfig();

    if (config.isStdioMode) {
        await startMcpServer();
    } else if (config.isHttpMode) {
        if (config.isRemoteMode) {
            console.log('Starting Figma Flutter MCP Server in REMOTE mode...');
            
            console.log('  - Authorization header (Bearer token)');
            console.log('  - iphoneDevice query parameter');
            console.log('See your available simulator by running: xcrun simctl list');
        } else {
            console.log('Starting Flutter Check Design MCP Server in HTTP mode...');
        }
        await startHttpServer(config.httpPort);
    } else {
        console.log('Starting Flutter Check Design MCP Server...');
       
        console.log('');
        console.log('Available modes:');
        console.log('  --stdio   MCP client communication');
        console.log('  --http    Local testing via HTTP');
        console.log('  --remote  Remote deployment (users provide keys via HTTP headers)');
        console.log('');
        console.log('📝 Choose your iPhone device: Run xcrun simctl list');
        
    }
    
}

startServer().catch((error) => {
    console.error('❌ Error starting server:', error);
    process.exit(1);
});