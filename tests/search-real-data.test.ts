import { describe, test, expect, beforeAll } from 'vitest';
import { WebScrapingService, ArxivSearchService, RedditSearchService } from '../server/services/search';
import { configService } from '../server/services/config';

describe('Search Services Real Data Validation', () => {
  let webService: WebScrapingService;
  let arxivService: ArxivSearchService;
  let redditService: RedditSearchService;

  beforeAll(() => {
    // Force production mode to ensure real search
    configService.setMode('prod');
    webService = new WebScrapingService();
    arxivService = new ArxivSearchService();
    redditService = new RedditSearchService();
  });

  describe('Web Search Real Data', () => {
    test('should fetch real webpage content (not mock)', async () => {
      const query = 'artificial intelligence news 2024';
      const count = 3;
      
      const results = await webService.search(query, count);
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        // Verify no mock data patterns
        expect(result.url).not.toMatch(/example\.com/);
        expect(result.title).not.toMatch(/AI in the Workplace: Latest Research Findings/);
        expect(result.content).not.toMatch(/Recent studies conducted by leading research institutions/);
        
        // Verify real URL structure
        expect(result.url).toMatch(/^https?:\/\//);
        expect(result.metadata.domain).not.toBe('example.com');
        
        // Verify full content was fetched (not just snippets)
        expect(result.content.length).toBeGreaterThan(100);
        
        // Verify metadata indicates real scraping
        expect(result.metadata).toHaveProperty('retrieved');
        expect(result.metadata).toHaveProperty('contentLength');
        expect(result.metadata.contentLength).toBeGreaterThan(100);
        
        // Verify timestamp is recent
        const retrievedTime = new Date(result.metadata.retrieved || result.metadata.scrapedAt);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        expect(retrievedTime.getTime()).toBeGreaterThan(fiveMinutesAgo.getTime());
      }
      
      console.log('Web search real data validation passed:', {
        resultsCount: results.length,
        domains: [...new Set(results.map(r => r.metadata.domain))],
        avgContentLength: Math.round(results.reduce((sum, r) => sum + r.content.length, 0) / results.length)
      });
    }, 60000);

    test('should verify content extraction is working', async () => {
      const query = 'machine learning research papers';
      const results = await webService.search(query, 2);
      
      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        // Content should be substantial (full page scrape)
        expect(result.content.length).toBeGreaterThan(500);
        
        // Should not contain HTML tags (proper extraction)
        expect(result.content).not.toMatch(/<[^>]*>/);
        
        // Should not be just the snippet
        if (result.metadata.snippet) {
          expect(result.content).not.toBe(result.metadata.snippet);
          expect(result.content.length).toBeGreaterThan(result.metadata.snippet.length);
        }
      }
    }, 60000);

    test('should handle multiple search terms with real results', async () => {
      const searchTerms = ['AI productivity tools', 'machine learning workplace'];
      const results = await webService.searchMultipleTerms(searchTerms, 3);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Verify no duplicate URLs
      const urls = results.map(r => r.url);
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(urls.length);
      
      // All should be real results
      for (const result of results) {
        expect(result.url).not.toMatch(/example\.com/);
        expect(result.metadata.searchTerm).toBeUndefined(); // Mock data includes searchTerm
      }
    }, 90000);
  });

  describe('ArXiv Search Real Data', () => {
    test('should fetch real arXiv papers (not mock)', async () => {
      const query = 'neural networks';
      const count = 3;
      
      const results = await arxivService.search(query, count);
      
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        // Verify arXiv URL format (updated to handle newer 5-digit format)
        expect(result.url).toMatch(/arxiv\.org/);
        
        // Verify no mock data patterns
        expect(result.title).not.toMatch(/Large Language Models and Knowledge Work: A Quantitative Analysis/);
        expect(result.content).not.toMatch(/We present a comprehensive quantitative analysis/);
        
        // Verify real arXiv metadata (updated regex for 2025+ papers)
        expect(result.metadata.arxivId).toMatch(/^\d{4}\.\d{4,6}(v\d+)?$/);
        expect(result.metadata.published).toMatch(/^\d{4}-\d{2}-\d{2}/);
        
        // Verify abstract is present and substantial
        expect(result.content.length).toBeGreaterThan(100);
        expect(result.metadata.abstract).toBeDefined();
        
        // Authors should be real names (not mock patterns)
        expect(result.metadata.authors.length).toBeGreaterThan(0);
        for (const author of result.metadata.authors) {
          expect(author).not.toMatch(/^(Smith|Johnson|Williams|Brown), [A-Z]\.$/);
        }
      }
      
      console.log('ArXiv search real data validation passed:', {
        resultsCount: results.length,
        papers: results.map(r => ({ id: r.metadata.arxivId, title: r.title.substring(0, 50) + '...' }))
      });
    }, 30000);

    test('should verify arXiv abstract content', async () => {
      const query = 'deep learning computer vision';
      const results = await arxivService.search(query, 2);
      
      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        // Content should be the full abstract
        expect(result.content).toBe(result.metadata.abstract);
        
        // Should not be truncated
        expect(result.content).not.toMatch(/\.\.\.$/);
        
        // Should be academic in nature
        const academicTerms = ['method', 'approach', 'results', 'propose', 'demonstrate', 'evaluate'];
        const hasAcademicTerms = academicTerms.some(term => 
          result.content.toLowerCase().includes(term)
        );
        expect(hasAcademicTerms).toBe(true);
      }
    }, 30000);
  });

  describe('Reddit Search Real Data', () => {
    test('should fetch real Reddit posts with comments (not mock)', async () => {
      const query = 'machine learning';
      const count = 3;
      
      const results = await redditService.search(query, count);
      
      // Reddit API might be unavailable, but if we get results, they should be real
      if (results.length > 0) {
        for (const result of results) {
          // Verify Reddit URL format
          expect(result.url).toMatch(/reddit\.com\/r\/\w+\/comments\//);
          
          // Verify no mock data patterns
          expect(result.title).not.toMatch(/Real experience using ChatGPT at work/);
          expect(result.content).not.toMatch(/I've been using ChatGPT for code reviews/);
          
          // Verify real Reddit metadata
          expect(result.metadata.subreddit).toMatch(/^r\/\w+$/);
          expect(result.metadata.created_utc).toBeGreaterThan(0);
          
          // If comments are included, verify they're real
          if (result.content.includes('Top comments:')) {
            expect(result.metadata.topCommentsIncluded).toBeGreaterThan(0);
            expect(result.metadata.topCommentsIncluded).toBeLessThanOrEqual(10);
          }
          
          // Author should not be mock pattern
          expect(result.metadata.author).not.toMatch(/^user_\d{4}$/);
        }
        
        console.log('Reddit search real data validation passed:', {
          resultsCount: results.length,
          subreddits: [...new Set(results.map(r => r.metadata.subreddit))],
          avgCommentsIncluded: Math.round(results.reduce((sum, r) => sum + (r.metadata.topCommentsIncluded || 0), 0) / results.length)
        });
      } else {
        console.log('Reddit API unavailable or no results - test skipped');
      }
    }, 45000);

    test('should verify Reddit comment truncation', async () => {
      const query = 'artificial intelligence discussion';
      const results = await redditService.search(query, 2);
      
      if (results.length > 0) {
        for (const result of results) {
          if (result.content.includes('Top comments:')) {
            // Extract comments section
            const commentsSection = result.content.split('Top comments:')[1];
            const comments = commentsSection.split('\n').filter(line => line.startsWith('•'));
            
            // Should have at most 10 comments
            expect(comments.length).toBeLessThanOrEqual(10);
            
            // Each comment should be truncated to ~200 chars
            for (const comment of comments) {
              const commentText = comment.substring(2).trim(); // Remove bullet point
              if (commentText.endsWith('...')) {
                expect(commentText.length).toBeLessThanOrEqual(203); // 200 + '...'
              }
            }
          }
        }
      }
    }, 45000);
  });

  describe('Mock Data Detection', () => {
    test('should not return any mock data patterns across all services', async () => {
      const query = 'artificial intelligence productivity';
      
      const [webResults, arxivResults, redditResults] = await Promise.all([
        webService.search(query, 2),
        arxivService.search(query, 2),
        redditService.search(query, 2)
      ]);
      
      const allResults = [...webResults, ...arxivResults, ...redditResults];
      
      // Common mock data patterns to check
      const mockPatterns = [
        /example\.com/,
        /Mock data/i,
        /test data/i,
        /This comprehensive analysis explores/,
        /Research Study: .* Impact Analysis/,
        /Implementation Guide for Enterprises/,
        /Author [A-Z]\./,
        /Researcher [A-Z]\./,
        /user_\d{4}/,
        /mock-\d+/
      ];
      
      for (const result of allResults) {
        for (const pattern of mockPatterns) {
          expect(result.title).not.toMatch(pattern);
          expect(result.content).not.toMatch(pattern);
          expect(result.url).not.toMatch(pattern);
          
          if (result.metadata.domain) {
            expect(result.metadata.domain).not.toMatch(pattern);
          }
        }
      }
      
      console.log('Mock data detection test passed - all results are real data');
    }, 90000);
  });

  describe('Error Handling', () => {
    test('should handle search failures gracefully without falling back to mock data', async () => {
      // Test with a query that might cause issues
      const problematicQuery = '🔍 €§¶ \\invalid\\ @#$%^&*()';
      
      const webResults = await webService.search(problematicQuery, 2);
      const arxivResults = await arxivService.search(problematicQuery, 2);
      const redditResults = await redditService.search(problematicQuery, 2);
      
      // Should return empty arrays or real results, never mock data
      for (const results of [webResults, arxivResults, redditResults]) {
        expect(Array.isArray(results)).toBe(true);
        
        if (results.length > 0) {
          // If any results are returned, they should be real
          for (const result of results) {
            expect(result.url).not.toMatch(/example\.com/);
            expect(result.metadata.domain).not.toBe('example.com');
          }
        }
      }
    }, 60000);
  });
});
