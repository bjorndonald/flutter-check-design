import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execAsync } from "../../utils/exec.js";
import { z } from "zod";

export function registerFlutterTools(server: McpServer) {
    server.registerTool(
        "flutter_build_ios",
        {
            title: "Build Flutter iOS app for simulator",
            description: "Build Flutter iOS app for simulator",
            inputSchema: {
                projectPath: z.string().describe("Path to Flutter project (defaults to current directory)").optional()
            } as any
        },
        // @ts-ignore - SDK typing quirks; runtime is correct
        async (args: any) => buildFlutterIos(args?.projectPath || '.')
    );

    server.registerTool(
        "get_flutter_devices",
        {
            title: "Get list of available Flutter devices (simulators and physical devices)",
            description: "Get list of available Flutter devices (simulators and physical devices)",
        },
        // @ts-ignore
        getFlutterDevices
    );
}

export async function buildFlutterIos(projectPath: string) {
    const { stdout, stderr } = await execAsync('flutter build ios', { cwd: projectPath });
    return {
      content: [{
        type: 'text',
        text: `Flutter iOS build completed:\n${stdout}${stderr ? `\nErrors/Warnings: ${stderr}` : ''}`
      }]
    };
  }

  export async function getFlutterDevices() {
    const { stdout } = await execAsync('flutter devices');
    return {
      content: [{
        type: 'text',
        text: `Available Flutter devices:\n${stdout}`
      }]
    };
  }