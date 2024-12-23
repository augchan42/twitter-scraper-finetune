// MessageExamplesCrawler.js
import fetch from "node-fetch";

class MessageExamplesCrawler {
    constructor(username, userID, apiKey) {
        this.username = username;
        this.userId = userID;
        this.apiKey = apiKey;
        this.baseUrl = process.env.RAPIDAPI_URL;
        this.messageExamples = [];
    }

    /// Entry point to add an example to the message examples list
    /// @param {string} pid - The post ID
    /// @param {number} count - The number of comments to fetch
    /// @param {string} rankingMode - The ranking mode for the comments
    async addExample(pid, count = 40, rankingMode = "Relevance") {
        // fetch the post comments
        const postCommentsData = await this.fetchPostComments(
            pid,
            count,
            rankingMode
        );

        // export the conversation list from the comments data
        const conversationList =
            postCommentsData["result"]["instructions"][0]["entries"];

        // process the quoted tweet, it should be the first entry in the conversation list if it exists
        let isQuotedTweet = false;
        if (
            conversationList.length > 0 &&
            conversationList[0]["content"]["itemContent"]["tweet_results"][
                "result"
            ]["legacy"]["is_quote_status"]
        ) {
            isQuotedTweet = true;
            const quotedMessageExample = this.processQuotedTweet(
                conversationList[0]
            );
            // ignore the quoted tweet if it's empty or contains only 1 tweet
            if (quotedMessageExample.length > 1) {
                this.messageExamples.push(quotedMessageExample);
            }
        }

        // process the rest of the conversation list
        let startIndex = isQuotedTweet ? 1 : 0;
        for (let i = startIndex; i < conversationList.length; i++) {
            const messageExample = this.processTweet(conversationList[i]);
            // ignore the tweet if it's empty or contains only 1 tweet
            if (messageExample.length > 1) {
                this.messageExamples.push(messageExample);
            }
        }
    }

    // Fetch post comments from the API using the pid, count, and rankingMode
    async fetchPostComments(pid, count, rankingMode) {
        const url = new URL(`${this.baseUrl}/comments`);
        url.searchParams.set("pid", pid);
        url.searchParams.set("count", count);
        url.searchParams.set("rankingMode", rankingMode);

        if (bottomCursor) {
            url.searchParams.set("cursor", bottomCursor);
        }
        const options = {
            method: "GET",
            headers: {
                "x-rapidapi-key": this.apiKey,
                "x-rapidapi-host": "twitter241.p.rapidapi.com",
            },
        };

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Error fetching examples:", error);
        }
    }

    processTweet(tweet) {
        const messageExample = [];

        // the other tweet contains a list of tweets, so we need to loop through them

        // but if the tweet contains only 1 tweet or empty, we can ignore it
        if (!tweet["content"]["items"]) {
            return messageExample;
        }
        const tweetList = tweet["content"]["items"];

        // we will ignore the advertisement tweets, they are the tweets having `promotedMetadata` field
        let str = "" + JSON.stringify(tweetList);
        if (str.indexOf("promotedMetadata") > 0) {
            return messageExample;
        }

        for (let i = 0; i < tweetList.length; i++) {
            // if the cursorType is ShowMore, it's the ... button, so we can stop
            if (
                tweetList[i]["item"]["itemContent"]["cursorType"] === "ShowMore"
            ) {
                break;
            }
            const tweetText =
                tweetList[i]["item"]["itemContent"]["tweet_results"]["result"][
                    "legacy"
                ]["full_text"];

            const tweetUser =
                tweetList[i]["item"]["itemContent"]["tweet_results"]["result"][
                    "legacy"
                ]["user_id_str"] == this.userId
                    ? this.username
                    : "user" +
                      tweetList[i]["item"]["itemContent"]["tweet_results"][
                          "result"
                      ]["legacy"]["user_id_str"];

            // add the tweet to the message example
            messageExample.push({
                user: "{{" + tweetUser + "}}",
                content: {
                    text: tweetText,
                },
            });
        }

        return messageExample;
    }

    processQuotedTweet(quotedTweet) {
        const messageExample = [];

        // get the quoted tweet information
        const quotedTweetText =
            quotedTweet["content"]["itemContent"]["tweet_results"]["result"][
                "quoted_status_result"
            ]["result"]["legacy"]["full_text"];

        const quotedUser =
            quotedTweet["content"]["itemContent"]["tweet_results"]["result"][
                "quoted_status_result"
            ]["result"]["legacy"]["user_id_str"] == this.userId
                ? this.username
                : quotedTweet["content"]["itemContent"]["tweet_results"][
                      "result"
                  ]["quoted_status_result"]["result"]["legacy"]["user_id_str"];

        // add the quoted tweet to the message example
        messageExample.push({
            user: "{{user" + quotedUser + "}}",
            content: {
                text: quotedTweetText,
            },
        });

        // get the post information
        const postText = quotedTweet["content"]["itemContent"]["tweet_results"][
            "result"
        ]["note_tweet"]
            ? quotedTweet["content"]["itemContent"]["tweet_results"]["result"][
                  "note_tweet"
              ]["note_tweet_results"]["result"]["text"]
            : quotedTweet["content"]["itemContent"]["tweet_results"]["result"][
                  "legacy"
              ]["full_text"];

        // add the post content to the message example
        messageExample.push({
            user: "{{" + this.username + "}}",
            content: {
                text: postText,
            },
        });

        return messageExample;
    }

    // Get the current message examples list
    collectedMessageExamples() {
        return this.messageExamples;
    }

    // Clear the message examples list
    clearExamples() {
        this.messageExamples = [];
    }
}

export default MessageExamplesCrawler;
