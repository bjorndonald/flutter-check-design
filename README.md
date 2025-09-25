# Flutter Check Design MCP Server

An MCP (Model Context Protocol) server that enables LLMs to build Flutter iOS apps, run them on simulators, and capture screenshots for design verification.

## Features

- Build Flutter iOS applications
- Discover and manage iOS simulators
- Install and launch Flutter apps on simulators
- Capture screenshots of running applications
- Complete automated workflow from build to screenshot

## Prerequisites

- Node.js 18+
- Flutter SDK installed and configured
- Xcode and iOS Simulator
- macOS (required for iOS simulator)

## Installation

1. Install dependencies:
```bash
npm install
```
2. Build the TypeScript sources:
```bash
npm run build
```

## Usage

### As MCP Server

Configure your MCP client (e.g., Cursor) to launch the server in stdio mode:

```json
{
  "mcpServers": {
    "flutter-design-checker": {
      "command": "node",
      "args": [
        "/absolute/path/to/flutter-check-design/dist/cli.js",
        "--stdio"
      ]
    }
  }
}
```

Dev alternatives:
- Local HTTP mode: `npm run dev` (prints endpoint), or `npm run dev:stdio` for stdio.
- If published, you can use `npx -y flutter-check-design --stdio`.

### Available Tools

#### `flutter_design_check_workflow`
Complete automated workflow – builds app, starts simulator, installs app, launches it, and takes a screenshot.

**Parameters:**
- `deviceId` (optional): iOS simulator device ID (auto-detected if omitted)
- `projectPath` (required): Path to Flutter project
- `screenshotFilename` (required): Screenshot filename (saved to `projectPath` by default)

#### `flutter_build_ios`
Builds Flutter iOS app for simulator.

**Parameters:**
- `projectPath` (optional): Path to Flutter project (defaults to current directory)

#### `get_flutter_devices`
Lists all available Flutter devices (simulators and physical devices).

#### `start_simulator`
Starts an iOS simulator and waits for it to boot.

**Parameters:**
- `deviceId` (required): Device ID of simulator to start

#### `install_flutter_app`
Installs Flutter app on specified device.

**Parameters:**
- `deviceId` (required): Target device ID
- `projectPath` (optional): Path to Flutter project (defaults to current directory)

#### `launch_flutter_app`
Launches the Flutter app using its bundle ID.

**Parameters:**
- `deviceId` (required): Target device ID
- `projectPath` (optional): Path to Flutter project (defaults to current directory)

#### `take_simulator_screenshot`
Captures screenshot of the iOS simulator.

**Parameters:**
- `filename` (optional): Screenshot filename (default: `screenshot_<timestamp>.png`)
- `outputPath` (optional): Directory to save screenshot (defaults to current directory)

### Available Prompts

#### `ensure_screen_matches_design`
Guides the LLM to iteratively build, run, screenshot, and refine the Flutter UI until the created screen matches the provided design at 100%.

**Arguments:**
- `designReference` (required): Figma URL, image path, or a short description of the target design

## Example Usage

```javascript
// Complete workflow - most common usage
await mcp.callTool('flutter_design_check_workflow', {
  projectPath: './my_flutter_app',
  screenshotFilename: 'design_check.png'
});

// Step by step
await mcp.callTool('flutter_build_ios', { projectPath: './my_flutter_app' });
await mcp.callTool('get_flutter_devices', {});
await mcp.callTool('start_simulator', { deviceId: 'ABCD1234-1234-1234-1234-123456789ABC' });
await mcp.callTool('install_flutter_app', {
  deviceId: 'ABCD1234-1234-1234-1234-123456789ABC',
  projectPath: './my_flutter_app'
});
await mcp.callTool('launch_flutter_app', {
  deviceId: 'ABCD1234-1234-1234-1234-123456789ABC',
  projectPath: './my_flutter_app'
});
await mcp.callTool('take_simulator_screenshot', {
  filename: 'app_screenshot.png'
});

// Prompt usage (if your MCP client supports prompts)
await mcp.getPrompt({
  name: 'ensure_screen_matches_design',
  arguments: { designReference: 'https://www.figma.com/file/...' }
});
```

## How It Works

The server executes the following workflow:

1. **Build**: Runs `flutter build ios` to create iOS simulator build
2. **Device Discovery**: Uses `flutter devices` to find available iOS simulators
3. **Simulator Start**: Opens Simulator app and boots the specified device with `xcrun simctl boot`
4. **Wait for Boot**: Polls `xcrun simctl list` until device shows "Booted" status
5. **Install**: Uses `flutter install -d <device_id>` to install the app
6. **Launch**: Extracts bundle ID from `Info.plist` and launches with `xcrun simctl launch`
7. **Screenshot**: Captures screen with `xcrun simctl io booted screenshot`

## Error Handling

The server includes comprehensive error handling and will provide detailed error messages if any step fails. Common issues:

- Flutter not installed or not in PATH
- Xcode/simulator not installed
- Device ID not found
- App build failures
- Simulator boot timeouts (30 second timeout)

## License

MIT