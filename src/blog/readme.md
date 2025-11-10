## Degen-AI Blog Scraper
### Version 1.0

This is a node script built with JavaScript that will take a list of blog/article links and parse their content data into a jsonl file for training an AI.

#### Instructions:

1. **Add URLs to scrape**: Edit `blogList.txt` and add URLs (one per line) to the articles you want to scrape. By default, it contains Marc Andreessen's blog posts from pmarchive.com. You can replace these with any publicly accessible blog URLs.

2. **Run the scraper**:
   ```bash
   npm run blog
   ```
   or directly:
   ```bash
   node scrapeBlogs.js
   ```

3. **Check output**: The scraped content will be saved to `articles.jsonl` in this directory. Review the file for any unwanted header/footer content that may need additional filtering.

#### Customizing for Different Sites:

If scraping a different website structure, you may need to modify the HTML selectors in `scrapeBlogs.js`:
- Line 38: Update the selectors (`'article'`, `'#main-content'`, `'body'`) to match your target site's HTML structure
- Line 16-18: Add site-specific filter phrases to exclude unwanted content

**Note**: Works best with publicly accessible articles. Sites behind authentication (like Medium paywalls) may not work.