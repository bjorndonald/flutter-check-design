import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execAsync } from "../../utils/exec.js";
import fs from 'fs/promises';
import path from "path";
import { z } from "zod";

export function registerIosTools(server: McpServer) {

    server.registerTool(
        "start_simulator",
        {
            title: "Start iOS simulator",
            description: "Start iOS simulator",
            inputSchema: {
                deviceId: z.string().describe("Simulators Device ID")
            } as any
        },
        // @ts-ignore
        async (args: any) => startSimulator(args.deviceId)
    );

    server.registerTool(
        "install_flutter_app",
        {
            title: "Install Flutter app on specified device",
            description: "Install Flutter app on specified device",
            inputSchema: {
                deviceId: z.string().describe("Device ID of simulator"),
                projectPath: z.string().describe("Path to Flutter project (defaults to current directory)").optional()
            } as any
        },
        // @ts-ignore
        async (args: any) => installFlutterApp(args.deviceId, args.projectPath || '.')
    );

    server.registerTool(
        "launch_flutter_app",
        {
            title: "Launch Flutter app",
            description: "Launch the Flutter app on simulator using bundle ID",
            inputSchema: {
                deviceId: z.string().describe("Device ID of the simulator"),
                projectPath: z.string().describe("Path to Flutter project (defaults to current directory)").optional()
            } as any
        },
        // @ts-ignore
        async (args: any) => launchFlutterApp(args.deviceId, args.projectPath || '.')
    );

    server.registerTool(
        "take_simulator_screenshot",
        {
            title: "Take screenshot of iOS simulator",
            description: "Take screenshot of iOS simulator which coul be used for the feedback loop",
            inputSchema: {
                filename: z.string().describe("Screenshot filename (defaults to screenshot_[timestamp].png)").optional(),
                outputPath: z.string().describe("Directory to save screenshot (defaults to current directory)").optional()
            } as any
        },
        // @ts-ignore
        async (args: any) => takeSimulatorScreenshot(args.filename || `screenshot_${Date.now()}.png`, args.outputPath || '.')
    );
}

export async function startSimulator(deviceId: string) {
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

 export async function installFlutterApp(deviceId: string, projectPath: string) {
    const { stdout, stderr } = await execAsync(`flutter install -d ${deviceId}`, { cwd: projectPath });
    return {
      content: [{
        type: 'text',
        text: `Flutter app installed on ${deviceId}:\n${stdout}${stderr ? `\nErrors/Warnings: ${stderr}` : ''}`
      }]
    };
  }

  export async function launchFlutterApp(deviceId: string, projectPath: string) {
    // Get bundle ID from Info.plist
    const plistPath = path.join(projectPath, 'build/ios/iphonesimulator/Runner.app/Info.plist');
    const { stdout: bundleId } = await execAsync(`/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${plistPath}"`);
    const cleanBundleId = bundleId.trim();

    // Check if app is installed on the booted simulator before launching
    const isInstalled = await isAppInstalledOnBootedSimulator(cleanBundleId);
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

 export async function takeSimulatorScreenshot(filename: string, outputPath: string) {
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
  export async function isAppInstalledOnBootedSimulator(bundleId: string) {
    try {
      const { stdout } = await execAsync(`xcrun simctl get_app_container booted ${bundleId}`);
      const containerPath = stdout.trim();
      return containerPath.length > 0;
    } catch {
      return false;
    }
  }