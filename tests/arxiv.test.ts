import { describe, test, expect, beforeAll } from 'vitest';
import { ArxivSearchService } from '../server/services/search';
import { configService } from '../server/services/config';

describe('ArxivSearchService', () => {
  let arxivService: ArxivSearchService;

  beforeAll(() => {
    // Force real mode for testing actual API
    configService.setMode('prod');
    arxivService = new ArxivSearchService();
  });

  test('should search arXiv and return valid results', async () => {
    const query = 'machine learning';
    const count = 5;
    
    const results = await arxivService.search(query, count);
    
    // Basic structure validation
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(count);
    
    // Validate each result structure
    for (const result of results) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('source', 'arxiv');
      expect(result).toHaveProperty('relevanceScore');
      expect(result).toHaveProperty('metadata');
      
      // Validate types
      expect(typeof result.id).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.content).toBe('string');
      expect(typeof result.url).toBe('string');
      expect(typeof result.relevanceScore).toBe('number');
      expect(typeof result.metadata).toBe('object');
      
      // Validate content is not empty
      expect(result.title.trim()).not.toBe('');
      expect(result.content.trim()).not.toBe('');
      expect(result.url.trim()).not.toBe('');
      
      // Validate arXiv URL format
      expect(result.url).toMatch(/arxiv\.org/);
      
      // Validate relevance score range
      expect(result.relevanceScore).toBeGreaterThanOrEqual(60);
      expect(result.relevanceScore).toBeLessThanOrEqual(100);
      
      // Validate metadata structure
      expect(result.metadata).toHaveProperty('published');
      expect(result.metadata).toHaveProperty('authors');
      expect(result.metadata).toHaveProperty('categories');
      expect(result.metadata).toHaveProperty('arxivId');
      
      // Validate metadata types
      expect(typeof result.metadata.published).toBe('string');
      expect(Array.isArray(result.metadata.authors)).toBe(true);
      expect(Array.isArray(result.metadata.categories)).toBe(true);
      expect(typeof result.metadata.arxivId).toBe('string');
      
      // Validate authors are strings
      for (const author of result.metadata.authors) {
        expect(typeof author).toBe('string');
        expect(author.trim()).not.toBe('');
      }
      
      // Validate categories are strings
      for (const category of result.metadata.categories) {
        expect(typeof category).toBe('string');
        expect(category.trim()).not.toBe('');
      }
    }
  }, 30000);

  test('should handle specific AI/ML query', async () => {
    const query = 'large language models';
    const count = 3;
    
    const results = await arxivService.search(query, count);
    
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(count);
    
    // Check that results are relevant to the query
    const queryTerms = ['language', 'model', 'neural', 'transformer', 'attention', 'llm'];
    let relevantResults = 0;
    
    for (const result of results) {
      const fullText = (result.title + ' ' + result.content).toLowerCase();
      const hasRelevantTerm = queryTerms.some(term => fullText.includes(term));
      if (hasRelevantTerm) {
        relevantResults++;
      }
    }
    
    // At least 60% of results should be relevant
    expect(relevantResults / results.length).toBeGreaterThanOrEqual(0.6);
  }, 30000);

  test('should handle empty results gracefully', async () => {
    const query = 'xyzabc123impossiblequery987654321';
    const count = 5;
    
    const results = await arxivService.search(query, count);
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // Should return empty array for impossible queries
    expect(results.length).toBe(0);
  }, 30000);

  test('should respect count parameter', async () => {
    const query = 'artificial intelligence';
    const count = 2;
    
    const results = await arxivService.search(query, count);
    
    expect(results).toBeDefined();
    expect(results.length).toBeLessThanOrEqual(count);
  }, 30000);

  test('should handle large count requests', async () => {
    const query = 'deep learning';
    const count = 20;
    
    const results = await arxivService.search(query, count);
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // Should handle large requests without errors
    expect(results.length).toBeLessThanOrEqual(count);
  }, 30000);

  test('should return results sorted by relevance/date', async () => {
    const query = 'computer vision';
    const count = 5;
    
    const results = await arxivService.search(query, count);
    
    if (results.length > 1) {
      // Check that relevance scores are in descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].relevanceScore).toBeGreaterThanOrEqual(results[i + 1].relevanceScore);
      }
    }
  }, 30000);

  test('should validate XML parsing works correctly', async () => {
    const query = 'neural networks';
    const count = 3;
    
    const results = await arxivService.search(query, count);
    
    expect(results.length).toBeGreaterThan(0);
    
    for (const result of results) {
      // Ensure XML was parsed correctly - no XML tags in content
      expect(result.title).not.toMatch(/<[^>]*>/);
      expect(result.content).not.toMatch(/<[^>]*>/);
      
      // Ensure metadata was extracted properly
      expect(result.metadata.published).toMatch(/\d{4}-\d{2}-\d{2}/); // Date format
      expect(result.metadata.authors.length).toBeGreaterThan(0);
      expect(result.metadata.categories.length).toBeGreaterThan(0);
    }
  }, 30000);

  test('should handle network errors gracefully', async () => {
    // This test might be hard to trigger consistently, but we can test with bad query that might cause issues
    const query = 'a'.repeat(1000); // Very long query
    const count = 5;
    
    const results = await arxivService.search(query, count);
    
    // Should not throw error and return array (possibly empty)
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  }, 30000);
});
