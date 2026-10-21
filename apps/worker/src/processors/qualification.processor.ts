import { processQualification, type ProcessorDeps, type QualificationJobData } from '@techmunda/core';

export const qualificationProcessor = (deps: ProcessorDeps) => (data: QualificationJobData) => processQualification(deps, data);
