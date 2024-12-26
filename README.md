# Degen Scraper

Pipeline for generating AI character files and training datasets by scraping public figures' online presence across Twitter and blogs.

> ⚠️ **IMPORTANT**: Create a new Twitter account for this tool. DO NOT use your main account as it may trigger Twitter's automation detection and result in account restrictions.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the `.env.example` into a `.env` file:

   ```properties
   # (Required) Twitter Authentication
   TWITTER_USERNAME=     # your twitter username
   TWITTER_PASSWORD=     # your twitter password
   TWITTER_EMAIL=        # your twitter email

   # RapidAPI Configuration
   RAPIDAPI_URL=
   RAPIDAPI_KEY=

   # Google Generative AI API Key. Required for summarizing tweets.
   GOOGLE_GENERATIVE_AI_API_KEY=

   # (Optional) Blog Configuration
   BLOG_URLS_FILE=      # path to file containing blog URLs

   # (Optional) Scraping Configuration
   MAX_TWEETS=          # max tweets to scrape
   MAX_RETRIES=         # max retries for scraping
   RETRY_DELAY=         # delay between retries
   MIN_DELAY=           # minimum delay between requests
   MAX_DELAY=           # maximum delay between requests
   ```

## Update

Add Rapid API to get more data.

Get full text tweet:

```javascript
const twitterCrawlAPI = new TwitterCrawlAPI();
twitterCrawlAPI.getFullTextTweet();
```

Use puppeteer to get full text tweet with tweet before Sep 29, 2022:

```javascript
twitterCrawlAPI.fallbackGetFullTextTweet();
```

Get message examples:

```javascript
this.messageExamplesCrawler = new MessageExamplesCrawler();
messageExamplesCrawler.addExample();
```

#### Using Google Generative AI to summarize tweets

```javascript
// Extract knowledge with longer tweets
const knowledgeGenerator = new KnowledgeGenerator();
await knowledgeGenerator.addKnowledge(uniqueTweets);
characterData.knowledge = knowledgeGenerator.getKnowledge();
```

## Usage

### Run as Server

```bash
npm run start
```

Add `express` Server

#### APIs:

- GET `/api/characters/:username` - get character data by username
- POST `/api/characters` - scrape tweets and blogs by username

```json
{
  "username": "pmarca", // twitter username
  "is_crawl": true // scrape tweets
}
```

### Collect Tweets and Blogs by using CLI

#### Twitter Collection

```bash
npm run twitter -- username
```

Example: `npm run twitter -- pmarca`

#### Blog Collection

```bash
npm run blog
```

#### Generate Character

```bash
npm run character -- username
```

Example: `npm run character -- pmarca`

#### Finetune

```bash
npm run finetune
```

#### Finetune (with test)

```bash
npm run finetune:test
```

#### Generate Virtuals Character Card

https://whitepaper.virtuals.io/developer-documents/agent-contribution/contribute-to-cognitive-core#character-card-and-goal-samples

Run this after Twitter Collection step

```bash
npm run generate-virtuals -- username date
```

Example: `npm run generate-virtuals -- pmarca 2024-11-29`
Example without date: `npm run generate-virtuals -- pmarca`

The generated character file will be in the `characters/[username].json` directory. Edit `clients` and `modelProvider` fields to match your needs.

The generated tweet dataset file will be in `pipeline/[username]/[date]/raw/tweets.json`.
