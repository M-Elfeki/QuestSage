import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load litellm_config.env file if it exists
 * This ensures config is loaded before any services initialize
 */
function loadLiteLLMConfig(): void {
  try {
    // Try multiple path resolutions to work in both dev and production
    const possiblePaths = [
      path.join(__dirname, '..', 'litellm_config.env'),        // From server/ (dev)
      path.join(process.cwd(), 'litellm_config.env'),           // From project root
      path.resolve(__dirname, '../litellm_config.env'),         // Alternative resolution
      path.join(__dirname, '..', '..', 'litellm_config.env'),  // From dist/ (production)
    ];
    
    let configPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        configPath = possiblePath;
        console.log(`✅ Found litellm_config.env at: ${configPath}`);
        break;
      }
    }
    
    if (!configPath) {
      console.warn(`⚠️  litellm_config.env not found. Tried: ${possiblePaths.join(', ')}`);
      return;
    }
    
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const lines = configContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse export KEY="value" format
      const exportMatch = trimmed.match(/^export\s+(\w+)="([^"]+)"/);
      if (exportMatch) {
        const [, key, value] = exportMatch;
        // Only set if not already in process.env (env vars take precedence)
        if (!process.env[key]) {
          process.env[key] = value;
          console.log(`✅ Loaded ${key} from litellm_config.env`);
        }
      }
    }
  } catch (error) {
    console.warn('Could not load litellm_config.env (this is optional):', error);
  }
}

// Load LiteLLM config file at module initialization (before any services)
loadLiteLLMConfig();

const app = express();

// Add CORS middleware for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Increase payload limits to handle large research data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the full error details
    log(`ERROR ${req.method} ${req.path} ${status}: ${message}`);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
