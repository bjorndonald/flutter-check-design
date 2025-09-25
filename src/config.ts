import {config as loadEnv} from "dotenv";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {resolve} from "path";
import {readFileSync} from "fs";
import {fileURLToPath} from "url";
import {dirname, join} from "path";

export interface ServerConfig {
    outputFormat: "yaml" | "json";
    isStdioMode: boolean;
    isHttpMode: boolean;
    isRemoteMode: boolean;
    httpPort: number;
    configSources: {
        envFile: "cli" | "default";
        stdio: "cli" | "env" | "default";
        http: "cli" | "env" | "default";
        remote: "cli" | "env" | "default";
        port: "cli" | "env" | "default";
    };
}

function getPackageVersion(): string {
    try {
        // Get the directory of the current module
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        
        // Read package.json from the project root (one level up from src)
        const packageJsonPath = join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version || '0.0.1';
    } catch (error) {
        // Fallback to environment variable or default
        return process.env.npm_package_version || '0.0.1';
    }
}

interface CliArgs {
    "figma-api-key"?: string;
    env?: string;
    stdio?: boolean;
    http?: boolean;
    remote?: boolean;
    port?: number;
}

export function getServerConfig(): ServerConfig {
    // Parse command line arguments
    const argv = yargs(hideBin(process.argv))
        .options({
            "figma-api-key": {
                type: "string",
                description: "Your Figma API key (can also be set via FIGMA_API_KEY env var)",
            },
            env: {
                type: "string",
                description: "Path to custom .env file to load environment variables from",
            },
            stdio: {
                type: "boolean",
                description: "Run in stdio mode for MCP client communication",
                default: false,
            },
            http: {
                type: "boolean",
                description: "Run in HTTP mode for local testing",
                default: false,
            },
            remote: {
                type: "boolean",
                description: "Run in remote mode - users provide their own Figma API keys",
                default: false,
            },
            port: {
                type: "number",
                description: "Port number for HTTP server",
                default: 3333,
            },
        })
        .help()
        .version(getPackageVersion())
        .parseSync() as CliArgs;

    // Load environment variables from custom path or default
    let envFilePath: string;
    let envFileSource: "cli" | "default";

    if (argv.env) {
        envFilePath = resolve(argv.env);
        envFileSource = "cli";
    } else {
        envFilePath = resolve(process.cwd(), ".env");
        envFileSource = "default";
    }

    // Load .env file with override if custom path provided
    loadEnv({path: envFilePath, override: !!argv.env});

    const config: ServerConfig = {
        outputFormat: "json",
        isStdioMode: false,
        isHttpMode: false,
        isRemoteMode: false,
        httpPort: 3333,
        configSources: {
            envFile: envFileSource,
            stdio: "default",
            http: "default",
            remote: "default",
            port: "default",
        },
    };

    
    // Users can provide API key via CLI args, .env file, or HTTP headers (in remote mode)

    // Handle stdio mode
    if (argv.stdio) {
        config.isStdioMode = true;
        config.configSources.stdio = "cli";
    } else if (process.env.NODE_ENV === "cli") {
        config.isStdioMode = true;
        config.configSources.stdio = "env";
    }

    // Handle HTTP mode
    if (argv.http) {
        config.isHttpMode = true;
        config.configSources.http = "cli";
    } else if (process.env.HTTP_MODE === "true") {
        config.isHttpMode = true;
        config.configSources.http = "env";
    }

    // Handle remote mode
    if (argv.remote) {
        config.isRemoteMode = true;
        config.isHttpMode = true; // Remote mode implies HTTP mode
        config.configSources.remote = "cli";
    } else if (process.env.REMOTE_MODE === "true") {
        config.isRemoteMode = true;
        config.isHttpMode = true; // Remote mode implies HTTP mode
        config.configSources.remote = "env";
    }

    // Handle port configuration
    if (argv.port) {
        config.httpPort = argv.port;
        config.configSources.port = "cli";
    } else if (process.env.HTTP_PORT) {
        config.httpPort = parseInt(process.env.HTTP_PORT, 10);
        config.configSources.port = "env";
    }

    

    // Log configuration sources (only in non-stdio mode)
    if (!config.isStdioMode) {
        console.log("\nConfiguration:");
        console.log(`- ENV_FILE: ${envFilePath} (source: ${config.configSources.envFile})`);
        
        console.log(`- STDIO_MODE: ${config.isStdioMode} (source: ${config.configSources.stdio})`);
        console.log(`- HTTP_MODE: ${config.isHttpMode} (source: ${config.configSources.http})`);
        console.log(`- REMOTE_MODE: ${config.isRemoteMode} (source: ${config.configSources.remote})`);
        if (config.isHttpMode) {
            console.log(`- HTTP_PORT: ${config.httpPort} (source: ${config.configSources.port})`);
        }
        console.log(); // Empty line for better readability
    }

    return config;
}