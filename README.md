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

2. Make the script executable:
```bash
chmod +x index.js
```

## Usage

### As MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "flutter-design-checker": {
      "command": "node",
      "args": ["/path/to/flutter-check-design/index.js"]
    }
  }
}
```

### Available Tools

#### `flutter_design_check_workflow`
Complete automated workflow - builds app, starts simulator, installs app, launches it, and takes screenshot.

**Parameters:**
- `device_id` (optional): iOS simulator device ID
- `project_path` (optional): Path to Flutter project (defaults to current directory)
- `screenshot_filename` (optional): Custom screenshot filename

#### `flutter_build_ios`
Builds Flutter iOS app for simulator.

**Parameters:**
- `project_path` (optional): Path to Flutter project

#### `get_flutter_devices`
Lists all available Flutter devices (simulators and physical devices).

#### `start_simulator`
Starts an iOS simulator and waits for it to boot.

**Parameters:**
- `device_id` (required): Device ID of simulator to start

#### `install_flutter_app`
Installs Flutter app on specified device.

**Parameters:**
- `device_id` (required): Target device ID
- `project_path` (optional): Path to Flutter project

#### `launch_flutter_app`
Launches the Flutter app using its bundle ID.

**Parameters:**
- `device_id` (required): Target device ID
- `project_path` (optional): Path to Flutter project

#### `take_simulator_screenshot`
Captures screenshot of the iOS simulator.

**Parameters:**
- `filename` (optional): Screenshot filename
- `output_path` (optional): Directory to save screenshot

## Example Usage

```javascript
// Complete workflow - most common usage
await mcp.callTool('flutter_design_check_workflow', {
  project_path: './my_flutter_app',
  screenshot_filename: 'design_check.png'
});

// Step by step
await mcp.callTool('flutter_build_ios', { project_path: './my_flutter_app' });
await mcp.callTool('get_flutter_devices', {});
await mcp.callTool('start_simulator', { device_id: 'ABCD1234-1234-1234-1234-123456789ABC' });
await mcp.callTool('install_flutter_app', {
  device_id: 'ABCD1234-1234-1234-1234-123456789ABC',
  project_path: './my_flutter_app'
});
await mcp.callTool('launch_flutter_app', {
  device_id: 'ABCD1234-1234-1234-1234-123456789ABC',
  project_path: './my_flutter_app'
});
await mcp.callTool('take_simulator_screenshot', {
  filename: 'app_screenshot.png'
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