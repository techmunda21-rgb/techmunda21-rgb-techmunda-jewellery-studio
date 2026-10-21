import { createRedis, loadEnv } from '@techmunda/core';

export const env = loadEnv();
export const connection = createRedis(env.REDIS_URL);
