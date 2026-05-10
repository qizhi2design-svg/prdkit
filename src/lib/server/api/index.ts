import express, { Router } from 'express';
import { createApiHelpers } from './helpers.js';
import { createPrototypesRouter } from './prototypes.js';
import { createMarksRouter } from './marks.js';
import { createCheckpointsRouter } from './checkpoints.js';
import { createPublishRouter } from './publish.js';
import { createAuthRouter } from './auth.js';
import { createConfigRouter } from './config.js';
import { createSystemRouter } from './system.js';

export function createApiRouter(prototypesDir: string): Router {
  const router = Router();
  const helpers = createApiHelpers(prototypesDir);

  router.use(express.json());
  router.use(createPrototypesRouter(helpers));
  router.use(createMarksRouter(helpers));
  router.use(createCheckpointsRouter(helpers));
  router.use(createPublishRouter(helpers));
  router.use(createAuthRouter(helpers));
  router.use(createConfigRouter(helpers));
  router.use(createSystemRouter(helpers));

  return router;
}
