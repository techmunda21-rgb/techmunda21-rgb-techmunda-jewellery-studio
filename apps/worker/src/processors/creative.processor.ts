import { processCreativeJob, type CreativeJobData, type ProcessorDeps } from '@techmunda/core';

export const creativeProcessor = (deps: ProcessorDeps) => (data: CreativeJobData) => processCreativeJob(deps, data);
