import type { Env, StorageDriver } from '@techmunda/core';
import type { PrismaClient } from '@techmunda/database';

export const PRISMA = 'PRISMA';
export const ENV = 'ENV';
export const STORAGE = 'STORAGE';
export type PrismaDb = PrismaClient;
export type AppEnv = Env;
export type AppStorage = StorageDriver;
