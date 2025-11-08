import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper function to truncate log messages
export function truncateLog(message: string, maxLength: number = 200): string {
  if (!message) return '';
  return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
}

// Rate Limiter for API calls with enhanced retry logic for quota exceeded errors
class RateLimiter {
  private callCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private config = {
    gemini: { maxCalls: 7, windowMs: 60 * 1000 }, // 7 calls per minute (with 5x60s retry on 429 errors)
    openai: { maxCalls: 10, windowMs: 60 * 1000 }, // 10 calls per minute
    anthropic: { maxCalls: 5, windowMs: 60 * 1000 }, // 5 calls per minute
  };

  private getCurrentWindow(service: string): { count: number; resetTime: number } {
    const now = Date.now();
    const current = this.callCounts.get(service);
    
    if (!current || now >= current.resetTime) {
      // Reset window
      const window = this.config[service as keyof typeof this.config];
      const resetTime = now + window.windowMs;
      this.callCounts.set(service, { count: 0, resetTime });
      return { count: 0, resetTime };
    }
    
    return current;
  }

  async executeWithQuotaHandling<T>(service: string, operation: () => Promise<T>): Promise<T> {
    const window = this.getCurrentWindow(service);
    
    if (window.count >= this.config[service as keyof typeof this.config].maxCalls) {
      const waitTime = window.resetTime - Date.now();
      console.log(`⏳ Rate limit reached for ${service}. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Reset window after waiting
      this.getCurrentWindow(service);
    }
    
    // Increment call count
    window.count++;
    
    const executeOperation = async (): Promise<T> => {
      // Enhanced retry logic for Gemini quota exceeded errors (429)
      // Will retry up to 10 times with 60-second waits between attempts
      const maxRetries = 10;
      const retryDelayMs = 60000; // 60 seconds
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await operation();
          if (attempt > 1) {
            console.log(`✅ Gemini ${service} operation succeeded on attempt ${attempt}/${maxRetries}`);
          }
          return result;
        } catch (error: any) {
          // Check for Gemini quota exceeded error (429)
          if (error.status === 429 && service === 'gemini') {
            if (attempt < maxRetries) {
              console.log(`🔄 Gemini quota exceeded (429). Attempt ${attempt}/${maxRetries} failed. Retrying in 60 seconds...`);
              console.log(`⏳ Waiting 60 seconds before retry attempt ${attempt + 1}/${maxRetries}...`);
              await new Promise(resolve => setTimeout(resolve, retryDelayMs));
              console.log(`🔁 Starting retry attempt ${attempt + 1}/${maxRetries} for ${service} operation`);
              continue; // Try again
            } else {
              console.error(`❌ Gemini quota exceeded: All ${maxRetries} retry attempts failed for ${service} operation`);
              console.error(`💡 Consider upgrading your Gemini API quota or waiting longer before making requests`);
              throw error;
            }
          }
          
          // For non-429 errors or non-gemini services, fail immediately
          console.error(`Error in ${service} operation:`, error);
          throw error;
        }
      }
      
      // This should never be reached, but TypeScript requires it
      throw new Error(`Unexpected end of retry loop for ${service} operation`);
    };
    
    return await executeOperation();
  }

  getCurrentCallCount(service: string): number {
    const window = this.getCurrentWindow(service);
    return window.count;
  }

  getTimeUntilReset(service: string): number {
    const window = this.getCurrentWindow(service);
    return Math.max(0, window.resetTime - Date.now());
  }
}

// TempStorage for managing temporary files
class TempStorage {
  private tempDir: string;

  constructor() {
    // Use local temp folder in QuestSage directory
    this.tempDir = path.join(process.cwd(), 'temp');
  }

  async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  async saveSurfaceSearchResults(sessionId: string, data: any): Promise<string> {
    await this.ensureTempDir();
    
    const filename = `surface-research-${sessionId}-${Date.now()}.json`;
    const filePath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`📁 Saved surface research data to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error saving surface search results:", error);
      throw error;
    }
  }

  async saveWebSearchResults(sessionId: string, data: any): Promise<string> {
    await this.ensureTempDir();
    
    const filename = `web-search-${sessionId}-${Date.now()}.json`;
    const filePath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`📁 Saved web search results to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error saving web search results:", error);
      throw error;
    }
  }

  async saveRedditSearchResults(sessionId: string, data: any): Promise<string> {
    await this.ensureTempDir();
    
    const filename = `reddit-search-${sessionId}-${Date.now()}.json`;
    const filePath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`📁 Saved Reddit search results to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error saving Reddit search results:", error);
      throw error;
    }
  }

  async saveArxivSearchResults(sessionId: string, data: any): Promise<string> {
    await this.ensureTempDir();
    
    const filename = `arxiv-search-${sessionId}-${Date.now()}.json`;
    const filePath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`📁 Saved arXiv search results to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error saving arXiv search results:", error);
      throw error;
    }
  }

  async saveSurfaceResearchReport(sessionId: string, data: any): Promise<string> {
    await this.ensureTempDir();
    
    const filename = `surface-research-report-${sessionId}-${Date.now()}.json`;
    const filePath = path.join(this.tempDir, filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`📁 Saved surface research report to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error saving surface research report:", error);
      throw error;
    }
  }

  async findSurfaceResearchFile(sessionId: string): Promise<string | null> {
    try {
      await this.ensureTempDir();
      const files = await fs.readdir(this.tempDir);
      
      // Find the most recent surface research file for this session
      const matchingFiles = files
        .filter(file => file.startsWith(`surface-research-${sessionId}-`))
        .map(file => ({
          name: file,
          path: path.join(this.tempDir, file),
          timestamp: parseInt(file.match(/-(\d+)\.json$/)?.[1] || '0')
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
      
      if (matchingFiles.length > 0) {
        return matchingFiles[0].path;
      }
      
      return null;
    } catch (error) {
      console.error("Error finding surface research file:", error);
      return null;
    }
  }

  async loadSurfaceSearchResults(filePath: string): Promise<any> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error("Error loading surface search results:", error);
      throw error;
    }
  }

  async cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      await this.ensureTempDir();
      
      const files = await fs.readdir(this.tempDir);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      
      for (const file of files) {
        // Clean up all types of temp files
        if (file.startsWith('surface-research-') || 
            file.startsWith('web-search-') || 
            file.startsWith('reddit-search-') || 
            file.startsWith('arxiv-search-') ||
            file.startsWith('surface-research-report-')) {
          const filePath = path.join(this.tempDir, file);
          try {
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(filePath);
              console.log(`🗑️ Cleaned up old temp file: ${file}`);
            }
          } catch (error) {
            console.warn(`Warning: Could not process temp file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn("Warning: Could not clean up temp directory:", error);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted temp file: ${filePath}`);
    } catch (error) {
      console.warn(`Warning: Could not delete temp file ${filePath}:`, error);
    }
  }
}

export const geminiRateLimiter = new RateLimiter();
export const tempStorage = new TempStorage();