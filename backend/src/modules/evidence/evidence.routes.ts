import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import * as controller from './evidence.controller';
import {
  createEvidenceSchema,
  listEvidenceQuerySchema,
  updateEvidenceSchema,
} from './evidence.schemas';
import { MAX_FILE_BYTES } from '../../utils/storage';

/**
 * Uploads are buffered in memory rather than written to a temporary directory.
 * The 10 MB cap makes that safe, and it removes a class of problem: there is no
 * temporary file to leak, to clean up, or to leave behind when a request fails
 * partway through.
 *
 * The limit is declared here as well as enforced in the storage layer. This one
 * rejects an oversized request before it is fully read; the storage layer is
 * the authority, because a limit that only exists at the edge is one refactor
 * away from disappearing.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

export const projectEvidenceRoutes = Router({ mergeParams: true });

projectEvidenceRoutes.use(requireAuth);
projectEvidenceRoutes.get(
  '/',
  validate(listEvidenceQuerySchema, 'query'),
  asyncHandler(controller.list),
);
projectEvidenceRoutes.post('/', validate(createEvidenceSchema), asyncHandler(controller.create));

// Multipart, so the body is not JSON and the usual validate() middleware does
// not apply. Title and description are validated in the service instead.
projectEvidenceRoutes.post('/upload', upload.single('file'), asyncHandler(controller.upload));

export const evidenceRoutes = Router();

evidenceRoutes.use(requireAuth);
evidenceRoutes.get('/:id/download', asyncHandler(controller.download));
evidenceRoutes.patch('/:id', validate(updateEvidenceSchema), asyncHandler(controller.update));
evidenceRoutes.delete('/:id', requireAdmin, asyncHandler(controller.remove));
