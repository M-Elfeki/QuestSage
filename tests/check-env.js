#!/usr/bin/env node

// Quick script to check environment variable configuration
import { config } from 'dotenv';
config();

console.log('🔧 QuestSage Environment Check\n');

const apiKeys = {
  'Gemini API Key': process.env.GEMINI_API_KEY,
  'OpenAI API Key': process.env.OPENAI_API_KEY,
  'Anthropic API Key': process.env.ANTHROPIC_API_KEY,
  'Google Search API Key': process.env.GOOGLE_SEARCH_API_KEY,
  'Perplexity API Key': process.env.PERPLEXITY_API_KEY,
  'Reddit Client ID': process.env.REDDIT_CLIENT_ID,
};

console.log('API Key Status:');
console.log('===============');

for (const [name, value] of Object.entries(apiKeys)) {
  const status = value && value !== 'your_' + name.toLowerCase().replace(/\s+/g, '_') + '_here' 
    ? '✅ Configured' 
    : '❌ Not Set';
  
  const displayValue = value && value !== 'your_' + name.toLowerCase().replace(/\s+/g, '_') + '_here'
    ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
    : 'Not configured';
    
  console.log(`${name.padEnd(25)} ${status.padEnd(15)} ${displayValue}`);
}

console.log('\n🎯 Minimum Requirements for Dev Mode:');
console.log('- Gemini API Key: ' + (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith('AIza') ? '✅ Ready' : '❌ Missing'));

console.log('\n🚀 Requirements for Production Mode:');
console.log('- OpenAI API Key: ' + (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-') ? '✅ Ready' : '❌ Missing'));
console.log('- Anthropic API Key: ' + (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-') ? '✅ Ready' : '❌ Missing'));
console.log('- Gemini API Key: ' + (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith('AIza') ? '✅ Ready' : '❌ Missing'));

console.log('\n📝 To add missing API keys:');
console.log('1. Edit the .env file in the QuestSage directory');
console.log('2. Replace placeholder values with your actual API keys');
console.log('3. Restart the server: npm run dev');
console.log('\n📖 See SETUP.md for detailed instructions');
