import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const DEFAULT_TTL = 86400; // 1 day in seconds

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
