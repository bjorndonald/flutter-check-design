// src/tools/index.mts
import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildFlutterIos, getFlutterDevices, registerFlutterTools } from "./flutter/index.js";
import { installFlutterApp, isAppInstalledOnBootedSimulator, launchFlutterApp, registerIosTools, startSimulator, takeSimulatorScreenshot } from "./ios/index.js";
import path from "path";
import { execAsync } from "../utils/exec.js";
import { z } from "zod";

export function registerAllTools(server: McpServer) {
    console.error('🛠️ Tools Debug - Starting tool registration...');

    // Register all tool categories
    registerFlutterTools(server);
    console.error('🛠️ Tools Debug - Flutter tools registered');

    registerIosTools(server);
    console.error('🛠️ Tools Debug - iOS tools registered');
    
    console.error('🛠️ Tools Debug - All tools registration complete');

    server.registerTool(
        "flutter_design_check_workflow",
        {
            title: "Flutter Design Check Workflow",
            description: "Flutter Design Check Workflow",
            inputSchema: {
                deviceId: z.string().describe("Device ID of the simulator (optional; will auto-detect)").optional(),
                projectPath: z.string().describe("Path to Flutter project"),
                screenshotFilename: z.string().describe("Screenshot filename")
            } as any
        },
        // @ts-ignore
        fullWorkflow
    );

    // Prompt: Ensure screen matches design iteratively
    server.registerPrompt(
        "ensure_screen_matches_design",
        {
            title: "Ensure Screen Matches Design (Iterative Workflow)",
            description: "Instructs the LLM to iteratively build, run, screenshot, and refine the Flutter UI until it matches the provided design at 100%.",
            argsSchema: {
                designReference: z.string().describe("Design reference: Figma URL, image path, or description")
            } as any
        },
        // @ts-ignore - accept generic args signature
        (args: any) => ({
            // optional runtime normalization
            description: undefined,
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: [
                        "You are implementing a Flutter screen that must match the target design at 100% visual fidelity.",
                        "Design reference:",
                        `- ${args?.designReference ?? "(not provided)"}`,
                        "",
                        "Follow this iterative workflow strictly:",
                        "1) Implement or update the Flutter UI code.",
                        "2) Build the iOS app (only when code has changed or first run) using tool: flutter_build_ios { projectPath }.",
                        "3) Start or reuse the simulator using tool: start_simulator { deviceId }.",
                        "4) Install the app if needed using tool: install_flutter_app { deviceId, projectPath }.",
                        "5) Launch the app using tool: launch_flutter_app { deviceId, projectPath }.",
                        "6) Capture a screenshot using tool: take_simulator_screenshot { filename, outputPath }.",
                        "7) Compare the screenshot against the design reference with a strict eye for pixel alignment, spacing, typography, colors, shadows, and radii.",
                        "8) If anything does not match exactly, refine the code and repeat from step 2 until the match is 100%.",
                        "",
                        "Constraints and best practices:",
                        "- Minimize rebuilds: only call flutter_build_ios when code changed or first run.",
                        "- Use small, focused edits per iteration.",
                        "- Ensure consistent fonts, weights, letter spacing, and line heights.",
                        "- Validate layout across safe areas and typical device sizes.",
                        "- Re-check visual differences after each iteration until no differences remain.",
                        "",
                        "Acceptance criteria (must all be satisfied):",
                        "- Pixel-perfect match to the design (layout, sizes, spacing).",
                        "- Typography (fonts, sizes, weights, letter spacing, line heights) exactly matches.",
                        "- Colors, shadows, radii, and iconography match.",
                        "- The final screenshot is indistinguishable from the design (100% match).",
                        "",
                        "Available tools in this server:",
                        "- flutter_build_ios(projectPath)",
                        "- get_flutter_devices()",
                        "- start_simulator(deviceId)",
                        "- install_flutter_app(deviceId, projectPath)",
                        "- launch_flutter_app(deviceId, projectPath)",
                        "- take_simulator_screenshot(filename, outputPath)",
                        "- flutter_design_check_workflow(deviceId?, projectPath, screenshotFilename)",
                        "",
                        "Always output the exact tool calls you will make with arguments, then execute them in order.",
                    ].join("\n")
                }
            }]
        })
    );

}

// @ts-ignore - handler signature matches runtime expectations from SDK
async function fullWorkflow(args: any) {
    let deviceId: string | undefined = args?.deviceId;
    const projectPath: string = args?.projectPath;
    const screenshotFilename: string = args?.screenshotFilename;
    const steps = [];

    try {
      // Step 1: Build iOS app
      steps.push('Building Flutter iOS app...');
      await buildFlutterIos(projectPath);
      steps.push('✓ iOS app built successfully');

      // Step 2: Get device ID if not provided
      if (!deviceId) {
        const devicesResult = await getFlutterDevices();
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
      await startSimulator(deviceId);
      steps.push('✓ Simulator started');

      // Step 4: Check if app is already installed on the booted simulator
      const plistPath = path.join(projectPath, 'build/ios/iphonesimulator/Runner.app/Info.plist');
      const { stdout: bundleId } = await execAsync(`/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${plistPath}"`);
      const cleanBundleId = bundleId.trim();
      steps.push(`Checking installed app container for bundle: ${cleanBundleId}...`);
      const alreadyInstalled = await isAppInstalledOnBootedSimulator(cleanBundleId);
      if (alreadyInstalled) {
        steps.push('✓ App already installed on booted simulator (get_app_container succeeded)');
      } else {
        // Install app if not installed
        steps.push('Installing Flutter app...');
        await installFlutterApp(deviceId, projectPath);
        steps.push('✓ App installed');
      }

      // Step 5: Launch app
      steps.push('Launching Flutter app...');
      await launchFlutterApp(deviceId, projectPath);
      steps.push('✓ App launched');

      // Step 6: Take screenshot
      steps.push('Taking screenshot...');
      const screenshotResult = await takeSimulatorScreenshot(screenshotFilename, projectPath);
      steps.push('✓ Screenshot captured');

      return {
        content: [{
          type: 'text',
          text: `Flutter Design Check Workflow completed:\n${steps.join('\n')}`
        }, ...screenshotResult.content.slice(1)] // Include the image from screenshot
      };

    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Workflow failed at step: ${steps[steps.length - 1]}\nError: ${error.message}\nCompleted steps:\n${steps.slice(0, -1).join('\n')}`
        }],
        isError: true
      };
    }
  }