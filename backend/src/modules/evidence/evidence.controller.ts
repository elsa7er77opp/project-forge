import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import * as service from './evidence.service';

export async function list(req: Request, res: Response): Promise<void> {
  const evidence = await service.listEvidence(req.user!, req.params.projectId, req.query as any);
  res.json({ evidence });
}

export async function create(req: Request, res: Response): Promise<void> {
  const evidence = await service.createEvidence(req.user!, req.params.projectId, req.body);
  res.status(201).json({ evidence });
}

export async function update(req: Request, res: Response): Promise<void> {
  const evidence = await service.updateEvidence(req.user!, req.params.id, req.body);
  res.json({ evidence });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deleteEvidence(req.user!, req.params.id);
  res.status(204).send();
}

export async function upload(req: Request, res: Response): Promise<void> {
  const file = (req as any).file as
    | { originalname: string; mimetype: string; buffer: Buffer }
    | undefined;

  if (!file) {
    res.status(400).json({ error: 'No file was uploaded' });
    return;
  }

  const evidence = await service.uploadEvidenceFile(req.user!, req.params.projectId, {
    originalName: file.originalname,
    mimeType: file.mimetype,
    title: req.body?.title,
    description: req.body?.description,
    stream: Readable.from(file.buffer),
  });

  res.status(201).json({ evidence });
}

export async function download(req: Request, res: Response): Promise<void> {
  const file = await service.downloadEvidenceFile(req.user!, req.params.id);

  res.setHeader('Content-Type', file.mimeType);
  // "attachment" rather than "inline". Anything served from the application's
  // own origin would otherwise run with the application's privileges if it
  // could be coaxed into being interpreted as a document.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(file.filename)}"`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (file.sizeBytes) res.setHeader('Content-Length', String(file.sizeBytes));

  file.stream.pipe(res);
}
