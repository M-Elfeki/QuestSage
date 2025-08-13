import dotenv from 'dotenv';
import { setupTestEnv } from './test-env';

// Load environment variables for testing
dotenv.config({ path: '.env.test' });

// Set test environment variables if not present
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Setup test environment with credentials
setupTestEnv();

// Mock console.error to avoid noise in tests unless explicitly needed
const originalConsoleError = console.error;
console.error = (...args) => {
  // Only show errors in test output if they contain 'FAIL' or 'ERROR'
  if (args.some(arg => typeof arg === 'string' && (arg.includes('FAIL') || arg.includes('ERROR')))) {
    originalConsoleError(...args);
  }
};
