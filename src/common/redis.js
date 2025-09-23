import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const redisUrl = process.env.REDIS_URL || null;
export const DEFAULT_TTL = 86400; // 1 day in seconds

// Provide a no-op shim when REDIS_URL is not configured
const createNoopRedis = () => ({
  get: async () => null,
  set: async () => true,
  del: async () => 0,
  keys: async () => [],
});

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    })
  : createNoopRedis();
