import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { createReadStream } from "fs";
import { KnowledgeGenerator } from "./KnowledgeGenerator.js";

class TweetProcessor {
  constructor(username, date) {
    this.username = username.toLowerCase();
    this.date = date;
    console.log(`Processing tweets for ${this.username} from ${this.date}`);

    this.baseDir = path.join("pipeline", username, date);
    this.characterFile = path.join("characters", `${username}.json`);

    // the data of a character
    this.name = this.username;
    this.plugins = [];
    this.clients = ["direct"];
    this.modelProvider = "google";
    this.settings = {
      secrets: {},
      voice: {
        model: "en_US-male-medium",
      },
    };
    this.system = `Roleplay and generate interesting content on behalf of ${this.username}.`;
    this.bio = ["A real human, not an AI agent"];
    this.lore = [];
    this.knowledge = [];
    this.messageExamples = [];
    this.postExamples = [];
    this.adjectives = [];
    this.people = [];
    this.topics = [];
    this.style = {
      all: [],
      chat: [],
      post: [],
    };
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dirPath}: ${error.message}`);
    }
  }

  getCharacterData() {
    return {
      name: this.name,
      plugins: this.plugins,
      clients: this.clients,
      modelProvider: this.modelProvider,
      settings: this.settings,
      system: this.system,
      bio: this.bio,
      lore: this.lore,
      knowledge: this.knowledge,
      messageExamples: this.messageExamples,
      postExamples: this.postExamples,
      adjectives: this.adjectives,
      people: this.people,
      topics: this.topics,
      style: this.style,
    };
  }

  async loadCharacterData() {
    try {
      const existingData = await fs.readFile(this.characterFile, "utf-8");
      return JSON.parse(existingData);
    } catch (error) {
      console.log(
        `Character file not found, creating new for ${this.username}`
      );
      await this.ensureDirectoryExists(path.dirname(this.characterFile));
      return this.getCharacterData();
    }
  }

  async readJsonlFile(filePath) {
    const tweets = [];
    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    fileStream.on("error", (error) => {
      console.error(`Error reading file: ${error.message}`);
    });

    for await (const line of rl) {
      lineNumber++;
      if (line.trim()) {
        try {
          tweets.push(JSON.parse(line));
        } catch (error) {
          console.warn(
            `Warning: Could not parse line ${lineNumber}: ${line}. Error: ${error.message}`
          );
        }
      } else {
        console.log(`Skipping empty or whitespace line ${lineNumber}`);
      }
    }

    console.log(`Total tweets read: ${tweets.length}`);
    return tweets;
  }

  async processTweets(messageExamples) {
    try {
      console.log(
        `Processing tweets for ${this.username} from date ${this.date}`
      );

      const tweetsPath = path.join(
        this.baseDir,
        "processed",
        "finetuning.jsonl"
      );
      console.log(`Tweets file path: ${tweetsPath}`);

      try {
        await fs.access(tweetsPath);
      } catch (error) {
        throw new Error(
          `No processed tweets found for ${this.username} on ${this.date}`
        );
      }

      const tweets = await this.readJsonlFile(tweetsPath);
      console.log(`Read ${tweets.length} tweets from JSONL file`);

      let characterData = await this.loadCharacterData();

      // Load bio from processed character file and add to character data if available
      const characterPath = path.join(
        this.baseDir,
        "character",
        "character.json"
      );
      console.log(`Character file path: ${characterPath}`);

      try {
        await fs.access(characterPath);
      } catch (error) {
        throw new Error(
          `No processed character found for ${this.username} on ${this.date}`
        );
      }

      const character = await fs.readFile(characterPath, "utf-8");
      const characterJson = JSON.parse(character);

      if (characterJson.bio) {
        characterData.bio.push(characterJson.bio);
      }

      if (characterJson.description) {
        characterData.bio.push(characterJson.description);
      }

      const filteredTweets = tweets
        .filter((tweet) => {
          if (!tweet.text) {
            console.log(
              `Filtered out tweet with no text: ${JSON.stringify(tweet)}`
            );
            return false;
          }
          return true;
        })
        .filter((tweet) => {
          if (tweet.text.startsWith("RT @")) {
            console.log(`Filtered out retweet: ${tweet.text}`);
            return false;
          }
          return true;
        })
        .map((tweet) => {
          return {
            ...tweet,
            text: tweet.text.replace(/@\S+/g, "").trim(),
          };
        });

      // Process tweets into postExamples - take all unique tweets
      const uniqueTweets = Array.from(
        new Set(filteredTweets.map((tweet) => tweet.text))
      );
      characterData.postExamples = uniqueTweets.filter(
        (text) => text.length >= 20 //&&
        // text.length <= 280
      );

      // Extract message examples
      if (messageExamples) {
        characterData.messageExamples = messageExamples;
      }

      // Extract knowledge with longer tweets
      const knowledgeGenerator = new KnowledgeGenerator();
      await knowledgeGenerator.addKnowledge(uniqueTweets);
      characterData.knowledge = knowledgeGenerator.getKnowledge();

      // Extract bio
      characterData.bio = characterData.bio.concat(knowledgeGenerator.getBio());

      // Extract lore
      characterData.lore = knowledgeGenerator.getLore();

      // Extract topics
      characterData.topics = knowledgeGenerator.getTopics();

      // Extract adjectives
      characterData.adjectives = knowledgeGenerator.getAdjectives();

      // Extract style
      characterData.style = knowledgeGenerator.getStyle();

      // Save updated character file
      await fs.writeFile(
        this.characterFile,
        JSON.stringify(characterData, null, 2),
        "utf-8"
      );

      console.log(`✅ Successfully processed tweets for ${this.username}`);
      console.log(
        `📝 Added ${characterData.postExamples.length} post examples`
      );
      console.log(`📝 Extracted ${characterData.topics.length} topics`);
    } catch (error) {
      console.error(`Failed to process tweets: ${error.message}`);
      throw error;
    }
  }
}

const run = async () => {
  const args = process.argv.slice(2);
  const username = args[0];
  const date = args[1];

  if (!username) {
    console.error("Please provide a username");
    process.exit(1);
  }

  if (!date) {
    console.error("Please provide a date in format YYYY-MM-DD");
    process.exit(1);
  }

  console.log(`Processing tweets for ${username} from ${date}`);
  const processor = new TweetProcessor(username, date);
  await processor.processTweets();
};

// run().catch((error) => {
//   console.error(error);
//   process.exit(1);
// });

export default TweetProcessor;
