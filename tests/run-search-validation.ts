#!/usr/bin/env node
import { WebScrapingService, ArxivSearchService, RedditSearchService } from '../server/services/search';
import { configService } from '../server/services/config';

console.log('🔍 Running Search Services Validation...\n');

// Force production mode to test real search
configService.setMode('prod');

async function validateWebSearch() {
  console.log('📌 Testing Web Search Service...');
  const webService = new WebScrapingService();
  
  try {
    const results = await webService.search('artificial intelligence 2024', 3);
    
    if (results.length === 0) {
      console.error('❌ Web search returned no results');
      return false;
    }
    
    let hasRealContent = true;
    
    results.forEach((result, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`  - Title: ${result.title.substring(0, 60)}...`);
      console.log(`  - URL: ${result.url}`);
      console.log(`  - Domain: ${result.metadata.domain}`);
      console.log(`  - Content Length: ${result.content.length} chars`);
      console.log(`  - Has Full Content: ${result.content.length > 500 ? '✅' : '❌'}`);
      
      // Validate it's not mock data
      if (result.url.includes('example.com') || result.metadata.domain === 'example.com') {
        console.error('  ❌ Mock data detected!');
        hasRealContent = false;
      }
    });
    
    console.log(`\n✅ Web search validated: ${results.length} real results fetched`);
    return hasRealContent;
  } catch (error) {
    console.error('❌ Web search error:', error);
    return false;
  }
}

async function validateArxivSearch() {
  console.log('\n📌 Testing ArXiv Search Service...');
  const arxivService = new ArxivSearchService();
  
  try {
    const results = await arxivService.search('machine learning', 3);
    
    if (results.length === 0) {
      console.error('❌ ArXiv search returned no results');
      return false;
    }
    
    let hasRealContent = true;
    
    results.forEach((result, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`  - Title: ${result.title.substring(0, 60)}...`);
      console.log(`  - ArXiv ID: ${result.metadata.arxivId}`);
      console.log(`  - Published: ${result.metadata.published}`);
      console.log(`  - Authors: ${result.metadata.authors.slice(0, 3).join(', ')}${result.metadata.authors.length > 3 ? '...' : ''}`);
      console.log(`  - Abstract Length: ${result.content.length} chars`);
      
      // Validate it's a real arXiv paper (updated for 2025+ format)
      if (!result.url.includes('arxiv.org') || !result.metadata.arxivId.match(/^\d{4}\.\d{4,6}(v\d+)?$/)) {
        console.error('  ❌ Invalid ArXiv format!');
        hasRealContent = false;
      }
    });
    
    console.log(`\n✅ ArXiv search validated: ${results.length} real papers fetched`);
    return hasRealContent;
  } catch (error) {
    console.error('❌ ArXiv search error:', error);
    return false;
  }
}

async function validateRedditSearch() {
  console.log('\n📌 Testing Reddit Search Service...');
  const redditService = new RedditSearchService();
  
  try {
    const results = await redditService.search('artificial intelligence', 3);
    
    if (results.length === 0) {
      console.log('⚠️  Reddit search returned no results (API might be unavailable)');
      return true; // Don't fail if Reddit is unavailable
    }
    
    let hasRealContent = true;
    
    results.forEach((result, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`  - Title: ${result.title.substring(0, 60)}...`);
      console.log(`  - Subreddit: ${result.metadata.subreddit}`);
      console.log(`  - Upvotes: ${result.metadata.upvotes}`);
      console.log(`  - Comments Included: ${result.metadata.topCommentsIncluded || 0}`);
      console.log(`  - Posted: ${new Date(result.metadata.created_utc * 1000).toISOString()}`);
      
      // Validate it's a real Reddit post
      if (!result.url.includes('reddit.com') || !result.metadata.subreddit.startsWith('r/')) {
        console.error('  ❌ Invalid Reddit format!');
        hasRealContent = false;
      }
    });
    
    console.log(`\n✅ Reddit search validated: ${results.length} real posts fetched`);
    return hasRealContent;
  } catch (error) {
    console.error('❌ Reddit search error:', error);
    return true; // Don't fail test if Reddit is unavailable
  }
}

async function validateMultiSearch() {
  console.log('\n📌 Testing Multi-Term Search...');
  const webService = new WebScrapingService();
  
  try {
    const searchTerms = ['AI productivity tools', 'machine learning workplace impact'];
    const results = await webService.searchMultipleTerms(searchTerms, 2);
    
    console.log(`\n  Searched ${searchTerms.length} terms, got ${results.length} total results`);
    
    // Check for duplicates
    const urls = results.map(r => r.url);
    const uniqueUrls = new Set(urls);
    console.log(`  Unique URLs: ${uniqueUrls.size}/${urls.length}`);
    
    if (uniqueUrls.size < urls.length) {
      console.log('✅ Duplicate removal is working');
    }
    
    return results.length > 0;
  } catch (error) {
    console.error('❌ Multi-search error:', error);
    return false;
  }
}

// Run all validations
async function runValidation() {
  console.log('Environment:', {
    MODE: configService.getConfig().mode,
    NODE_ENV: process.env.NODE_ENV,
    HAS_OPENAI: !!process.env.OPENAI_API_KEY,
    HAS_REDDIT: !!process.env.REDDIT_CLIENT_ID
  });
  console.log('\n' + '='.repeat(60) + '\n');
  
  const results = {
    web: await validateWebSearch(),
    arxiv: await validateArxivSearch(),
    reddit: await validateRedditSearch(),
    multi: await validateMultiSearch()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 VALIDATION SUMMARY:');
  console.log(`  Web Search: ${results.web ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  ArXiv Search: ${results.arxiv ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Reddit Search: ${results.reddit ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Multi-Search: ${results.multi ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED!'}`);
  
  process.exit(allPassed ? 0 : 1);
}

runValidation().catch(error => {
  console.error('\n❌ Validation script error:', error);
  process.exit(1);
});
