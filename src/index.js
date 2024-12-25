import express from "express";
import bodyParser from "body-parser";
import TwitterPipeline from "./twitter/TwitterPipeline.js";
import TweetProcessor from "./character/GenerateCharacter.js";
import { isRawTweetsFileExists } from "./twitter/utils.js";
import fs from "fs/promises";
import dotenv from "dotenv";
import cors from "cors";
import { redis, DEFAULT_TTL } from "./redis/redis.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Use middleware to parse JSON
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors());
// Enable caching for all routes
let logs = [];

// Declare pipeline
const pipeline = new TwitterPipeline();

// Middleware to capture console logs
const originalLog = console.log;
console.log = (...args) => {
  originalLog(...args);
  logs.push(args.join(" "));
};

app.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Override console.log to send logs via SSE
  const originalLog = console.log;
  console.log = (...args) => {
    // Check args start with 📊 Progress:
    originalLog(...args);
    res.write(`data: ${args.join(" ")}\n\n`);
  };

  // Close connection on client disconnect
  req.on("close", () => {
    // console.log("Client disconnected");
    console.log = originalLog; // Restore console.log
    res.end();
  });
});

// Set up a basic route
app.get("/", (req, res) => {
  res.send("Hello, World! This is your Express server.");
});

// Define additional routes
app.post("/api/characters", async (req, res) => {
  const data = req.body;
  const { username, date, is_crawl } = data;
  const taskId = `task_${username}_${Date.now()}`; // Unique task ID
  const taskProgress = { taskId, progress: 0, username, status: "IN_PROGRESS" };

  // Save task progress in redis
  // find redis key with pattern username
  // if exists, delete it
  const keys = await redis.keys(`task_${username}_*`);
  await Promise.all(
    keys.map(async (key) => {
      const data = await redis.get(key);
      const task = JSON.parse(data);
      if (task.status === "COMPLETED") {
        console.log(`Deleting task: ${key}`);
        redis.del(key);
      }
    })
  );

  redis
    .set(taskId, JSON.stringify(taskProgress), "EX", DEFAULT_TTL)
    .then(() => {
      console.log("Task progress saved in redis");
      res.json(taskProgress);
    });

  console.log(`Received username: ${username}`);
  await pipeline.initializeOrganizer(username);
  await pipeline.initializeScraper(username);
  if ((await isRawTweetsFileExists(pipeline.paths.raw.tweets)) && !is_crawl) {
    console.log(`Raw tweets for ${username} already exist`);
  } else {
    console.log(`Downloading raw tweets for ${username}`);
    await pipeline.run(username, taskId);

    console.log(`Processing tweets for ${username} from ${date}`);
    const tweetProcessor = new TweetProcessor(username, date);
    // Generate character
    await tweetProcessor.processTweets(
      pipeline.messageExamplesCrawler.messageExamples
    );
  }
});

app.get("/api/task-progress/:taskId", async (req, res) => {
  const taskId = req.params.taskId;
  console.log(`Fetching task progress for task ID: ${taskId}`);

  redis.get(taskId).then((taskProgress) => {
    if (taskProgress) {
      res.json(JSON.parse(taskProgress));
    } else {
      res.status(404).send("Task not found");
    }
  });
});

app.get("/api/characters/:username", async (req, res) => {
  const username = req.params.username;
  const pathFile = `characters/${username}.json`;
  if (await isRawTweetsFileExists(pathFile)) {
    const characterData = await fs.readFile(pathFile, "utf-8");
    res.json({ characterData: JSON.parse(characterData) });
  } else {
    // res.status(404).send("Character not found");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
