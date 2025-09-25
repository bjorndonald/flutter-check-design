#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import { URL } from 'url';

const execAsync = promisify(exec);

class FlutterDesignChecker {
  constructor() {
    this.server = new Server({
      name: 'flutter-check-design',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
      },
    });

    this.transportsBySession = new Map();
    this.currentTransport = undefined;

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'flutter_build_ios',
          description: 'Build Flutter iOS app for simulator',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to Flutter project (defaults to current directory)',
                default: '.'
              }
            }
          }
        },
        {
          name: 'get_flutter_devices',
          description: 'Get list of available Flutter devices (simulators and physical devices)',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'start_simulator',
          description: 'Start iOS simulator if not already running',
          inputSchema: {
            type: 'object',
            properties: {
              device_id: {
                type: 'string',
                description: 'Device ID of the simulator to start'
              }
            },
            required: ['device_id']
          }
        },
        {
          name: 'install_flutter_app',
          description: 'Install Flutter app on specified device',
          inputSchema: {
            type: 'object',
            properties: {
              device_id: {
                type: 'string',
                description: 'Device ID to install app on'
              },
              project_path: {
                type: 'string',
                description: 'Path to Flutter project (defaults to current directory)',
                default: '.'
              }
            },
            required: ['device_id']
          }
        },
        {
          name: 'launch_flutter_app',
          description: 'Launch the Flutter app on simulator using bundle ID',
          inputSchema: {
            type: 'object',
            properties: {
              device_id: {
                type: 'string',
                description: 'Device ID of the simulator'
              },
              project_path: {
                type: 'string',
                description: 'Path to Flutter project (defaults to current directory)',
                default: '.'
              }
            },
            required: ['device_id']
          }
        },
        {
          name: 'take_simulator_screenshot',
          description: 'Take screenshot of iOS simulator',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Screenshot filename (defaults to screenshot_[timestamp].png)'
              },
              output_path: {
                type: 'string',
                description: 'Directory to save screenshot (defaults to current directory)',
                default: '.'
              }
            }
          }
        },
        {
          name: 'flutter_design_check_workflow',
          description: 'Complete workflow: build, install, launch Flutter app and take screenshot',
          inputSchema: {
            type: 'object',
            properties: {
              device_id: {
                type: 'string',
                description: 'Device ID of the simulator (if not provided, will use first available iOS simulator)'
              },
              project_path: {
                type: 'string',
                description: 'Path to Flutter project (defaults to current directory)',
                default: '.'
              },
              screenshot_filename: {
                type: 'string',
                description: 'Screenshot filename (defaults to screenshot_[timestamp].png)'
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'flutter_build_ios':
            return await this.buildFlutterIos(args.project_path || '.');

          case 'get_flutter_devices':
            return await this.getFlutterDevices();

          case 'start_simulator':
            return await this.startSimulator(args.device_id);

          case 'install_flutter_app':
            return await this.installFlutterApp(args.device_id, args.project_path || '.');

          case 'launch_flutter_app':
            return await this.launchFlutterApp(args.device_id, args.project_path || '.');

          case 'take_simulator_screenshot':
            return await this.takeSimulatorScreenshot(args.filename, args.output_path || '.');

          case 'flutter_design_check_workflow':
            return await this.fullWorkflow(args.device_id, args.project_path || '.', args.screenshot_filename);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async buildFlutterIos(projectPath) {
    const { stdout, stderr } = await execAsync('flutter build ios', { cwd: projectPath });
    return {
      content: [{
        type: 'text',
        text: `Flutter iOS build completed:\n${stdout}${stderr ? `\nErrors/Warnings: ${stderr}` : ''}`
      }]
    };
  }

  async getFlutterDevices() {
    const { stdout } = await execAsync('flutter devices');
    return {
      content: [{
        type: 'text',
        text: `Available Flutter devices:\n${stdout}`
      }]
    };
  }

  async startSimulator(deviceId) {
    // First check if simulator is already booted
    try {
      const { stdout } = await execAsync('xcrun simctl list');
      if (stdout.includes(deviceId) && stdout.includes('Booted')) {
        return {
          content: [{
            type: 'text',
            text: `Simulator ${deviceId} is already running`
          }]
        };
      }
    } catch (error) {
      // Continue with starting the simulator
    }

    // Start the simulator
    await execAsync(`open -a Simulator`);
    await execAsync(`xcrun simctl boot ${deviceId}`);

    // Wait for simulator to boot
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        const { stdout } = await execAsync('xcrun simctl list');
        if (stdout.includes(deviceId) && stdout.includes('Booted')) {
          return {
            content: [{
              type: 'text',
              text: `Simulator ${deviceId} started successfully`
            }]
          };
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
    }

    throw new Error(`Simulator ${deviceId} failed to start within timeout period`);
  }

  async installFlutterApp(deviceId, projectPath) {
    const { stdout, stderr } = await execAsync(`flutter install -d ${deviceId}`, { cwd: projectPath });
    return {
      content: [{
        type: 'text',
        text: `Flutter app installed on ${deviceId}:\n${stdout}${stderr ? `\nErrors/Warnings: ${stderr}` : ''}`
      }]
    };
  }

  async launchFlutterApp(deviceId, projectPath) {
    // Get bundle ID from Info.plist
    const plistPath = path.join(projectPath, 'build/ios/iphonesimulator/Runner.app/Info.plist');
    const { stdout: bundleId } = await execAsync(`/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${plistPath}"`);
    const cleanBundleId = bundleId.trim();

    // Check if app is installed on the booted simulator before launching
    const isInstalled = await this.isAppInstalledOnBootedSimulator(cleanBundleId);
    if (!isInstalled) {
      throw new Error(`App with bundle ID ${cleanBundleId} is not installed on the booted simulator. Please install before launching.`);
    }

    // Launch the app
    await execAsync(`xcrun simctl launch ${deviceId} ${cleanBundleId}`);

    // Wait a moment for app to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    return {
      content: [{
        type: 'text',
        text: `Flutter app launched on ${deviceId} with bundle ID: ${cleanBundleId}`
      }]
    };
  }

  async takeSimulatorScreenshot(filename, outputPath) {
    const timestamp = Date.now();
    const screenshotName = filename || `screenshot_${timestamp}.png`;
    const fullPath = path.join(outputPath, screenshotName);

    await execAsync(`xcrun simctl io booted screenshot "${fullPath}"`);

    return {
      content: [{
        type: 'text',
        text: `Screenshot saved to: ${fullPath}`
      }, {
        type: 'image',
        data: await fs.readFile(fullPath, 'base64'),
        mimeType: 'image/png'
      }]
    };
  }

  /**
   * Check if the app (identified by bundleId) is installed on the currently booted simulator.
   * Uses: xcrun simctl get_app_container booted <BUNDLE_ID>
   * Returns true if the command succeeds and a container path is returned, false otherwise.
   */
  async isAppInstalledOnBootedSimulator(bundleId) {
    try {
      const { stdout } = await execAsync(`xcrun simctl get_app_container booted ${bundleId}`);
      const containerPath = stdout.trim();
      return containerPath.length > 0;
    } catch {
      return false;
    }
  }

  async fullWorkflow(deviceId, projectPath, screenshotFilename) {
    const steps = [];

    try {
      // Step 1: Build iOS app
      steps.push('Building Flutter iOS app...');
      await this.buildFlutterIos(projectPath);
      steps.push('✓ iOS app built successfully');

      // Step 2: Get device ID if not provided
      if (!deviceId) {
        const devicesResult = await this.getFlutterDevices();
        const devicesOutput = devicesResult.content[0].text;
        const iosSimulatorMatch = devicesOutput.match(/iOS Simulator.*?\(mobile\).*?• ([a-zA-Z0-9-]+)/);
        if (iosSimulatorMatch) {
          deviceId = iosSimulatorMatch[1];
          steps.push(`✓ Using iOS simulator: ${deviceId}`);
        } else {
          throw new Error('No iOS simulator found');
        }
      }

      // Step 3: Start simulator
      steps.push('Starting simulator...');
      await this.startSimulator(deviceId);
      steps.push('✓ Simulator started');

      // Step 4: Check if app is already installed on the booted simulator
      const plistPath = path.join(projectPath, 'build/ios/iphonesimulator/Runner.app/Info.plist');
      const { stdout: bundleId } = await execAsync(`/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${plistPath}"`);
      const cleanBundleId = bundleId.trim();
      steps.push(`Checking installed app container for bundle: ${cleanBundleId}...`);
      const alreadyInstalled = await this.isAppInstalledOnBootedSimulator(cleanBundleId);
      if (alreadyInstalled) {
        steps.push('✓ App already installed on booted simulator (get_app_container succeeded)');
      } else {
        // Install app if not installed
        steps.push('Installing Flutter app...');
        await this.installFlutterApp(deviceId, projectPath);
        steps.push('✓ App installed');
      }

      // Step 5: Launch app
      steps.push('Launching Flutter app...');
      await this.launchFlutterApp(deviceId, projectPath);
      steps.push('✓ App launched');

      // Step 6: Take screenshot
      steps.push('Taking screenshot...');
      const screenshotResult = await this.takeSimulatorScreenshot(screenshotFilename, projectPath);
      steps.push('✓ Screenshot captured');

      return {
        content: [{
          type: 'text',
          text: `Flutter Design Check Workflow completed:\n${steps.join('\n')}`
        }, ...screenshotResult.content.slice(1)] // Include the image from screenshot
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Workflow failed at step: ${steps[steps.length - 1]}\nError: ${error.message}\nCompleted steps:\n${steps.slice(0, -1).join('\n')}`
        }],
        isError: true
      };
    }
  }

  async run() {
    const port = Number(process.env.PORT) || 3333;
    const httpServer = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://localhost:${port}`);

        if (req.method === 'GET' && url.pathname === '/sse') {
          if (this.currentTransport) {
            res.writeHead(409).end('MCP server already has an active SSE session');
            return;
          }

          const transport = new SSEServerTransport(`http://localhost:${port}/messages`, res);
          this.currentTransport = transport;
          const sessionId = transport.sessionId;
          this.transportsBySession.set(sessionId, transport);

          transport.onclose = () => {
            this.transportsBySession.delete(sessionId);
            if (this.currentTransport === transport) {
              this.currentTransport = undefined;
            }
          };

          await this.server.connect(transport);
          return; // keep SSE connection open
        }

        if (req.method === 'POST' && url.pathname === '/messages') {
          const sessionId = url.searchParams.get('sessionId');
          if (!sessionId) {
            res.writeHead(400).end('Missing sessionId');
            return;
          }
          const transport = this.transportsBySession.get(sessionId);
          if (!transport) {
            res.writeHead(404).end('Unknown session');
            return;
          }

          await transport.handlePostMessage(req, res);
          return;
        }

        res.writeHead(404).end('Not found');
      } catch (error) {
        try {
          if (!res.headersSent) {
            res.writeHead(500);
          }
          if (!res.writableEnded) {
            res.end(String(error));
          }
        } catch (_) {
          // Ignore secondary errors while attempting to report the original one
        }
      }
    });

    httpServer.listen(port, () => {
      console.log(`[MCP] SSE server listening on http://localhost:${port}`);
      console.log(`[MCP] SSE endpoint: http://localhost:${port}/sse`);
    });
  }
}

const server = new FlutterDesignChecker();
server.run().catch(console.error);