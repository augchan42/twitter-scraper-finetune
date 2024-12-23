import express from "express";
import bodyParser from "body-parser";
import TwitterPipeline from "./twitter/TwitterPipeline.js";
import TweetProcessor from "./character/GenerateCharacter.js";
import fs from "fs/promises";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
// Use middleware to parse JSON
app.use(bodyParser.json());

// Set up a basic route
app.get("/", (req, res) => {
  res.send("Hello, World! This is your Express server.");
});

// Define additional routes
app.post("/api/characters", async (req, res) => {
  const data = req.body;
  const { username, date } = data;
  console.log(`Received username: ${username}`);
  const pipeline = new TwitterPipeline(username);
  if (await pipeline.isRawTweetsFileExists()) {
    console.log(`Raw tweets for ${username} already exist`);
  } else {
    console.log(`Downloading raw tweets for ${username}`);
    await pipeline.run();
  }
  console.log(`Processing tweets for ${username} from ${date}`);
  const tweetProcessor = new TweetProcessor(username, date);

  // Generate character
  await tweetProcessor.processTweets(
    pipeline.messageExamplesCrawler.messageExamples
  );
  const characterData = await fs.readFile(
    `characters/${username}.json`,
    "utf-8"
  );

  res.json({ characterData });
});

app.get("/api/characters/:username", async (req, res) => {
  const username = req.params.username;
  const characterData = await fs.readFile(
    `characters/${username}.json`,
    "utf-8"
  );

  res.json({ characterData });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
