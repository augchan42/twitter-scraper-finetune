import puppeteer from "puppeteer";
import TurndownService from "turndown";
import fs from "fs/promises";
import path from "path";

async function crawlWarringStates() {
    console.log('Starting crawler...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const visitedUrls = new Set<string>();
    const turndown = new TurndownService();

    // Base URL
    const baseUrl = "https://warringstates.wixsite.com/warringstates";
    console.log(`Navigating to ${baseUrl}`);

    try {
        // Start with the root URL
        await page.goto(baseUrl, {
            waitUntil: 'networkidle0',
            timeout: 10000
        });

        // Get all story links
        const links = await page.evaluate(() => {
            const anchors = document.querySelectorAll('a[href*="warringstates"]');
            return Array.from(anchors, a => (a as HTMLAnchorElement).href);
        });

        console.log(`Found ${links.length} links to crawl`);

        // Create output directory if it doesn't exist
        const outputDir = path.join(process.cwd(), 'knowledge', 'warringstates');
        await fs.mkdir(outputDir, { recursive: true });

        // Crawl each link
        for (const link of links) {
            if (visitedUrls.has(link)) continue;
            visitedUrls.add(link);

            console.log(`Crawling: ${link}`);
            await page.goto(link, {
                waitUntil: 'networkidle0',
                timeout: 10000
            });

            const content = await page.evaluate(() => {
                const sections: string[] = [];
                const contentDivs = document.querySelectorAll('.wixui-rich-text');
                
                contentDivs.forEach(div => {
                    if (!div.textContent?.trim()) return;
                    
                    let html = '';
                    const header = div.querySelector('h1, h2');
                    if (header) {
                        html += header.outerHTML + '\n\n';
                    }
                    
                    const paragraphs = div.querySelectorAll('p');
                    paragraphs.forEach(p => {
                        if (p.textContent?.trim()) {
                            html += p.outerHTML + '\n\n';
                        }
                    });
                    
                    if (html) {
                        sections.push(html);
                    }
                });

                return sections.join('\n');
            });

            if (content && content.length > 100) {
                // Convert HTML to Markdown
                const markdown = turndown.turndown(content)
                    .replace(/\n{3,}/g, '\n\n')
                    .replace(/^(#{1,6})([^\s])/gm, '$1 $2')
                    .replace(/\[(\d+)\]/g, '^$1^')
                    .replace(/\*\*/g, '_');

                const filename = link.split('/').pop() || 'index';
                await fs.writeFile(path.join(outputDir, `${filename}.md`), markdown);
            }
        }

    } catch (error) {
        console.error(`Error crawling:`, error);
        await fs.appendFile('failed-urls.txt', `${baseUrl}\n`);
    } finally {
        await browser.close();
    }
}

// Actually execute the function
crawlWarringStates().catch(console.error);
