import { createClient } from 'redis';
import { RedisStore } from 'rate-limit-redis';

let redisClient = null;

export async function getRedisStore(prefix = 'rl:') {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) return undefined;

  if (!redisClient) {
    try {
      redisClient = createClient({ url: redisUrl });
      redisClient.on('error', (err) => console.error('[Redis Error]', err));
      await redisClient.connect();
    } catch (err) {
      console.error('[Redis] Failed to connect, falling back to memory store:', err.message);
      return undefined;
    }
  }

  try {
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix,
    });
  } catch (err) {
    console.error('[RedisStore] Initialization failed:', err.message);
    return undefined;
  }
}
