-- Evidence file storage.
--
-- Adds the columns needed to record an uploaded file alongside the existing
-- link support. A row is either a link or a file, distinguished by "source";
-- existing rows are all links, which is why the default is 'LINK' and every
-- file column is nullable.
--
-- The bytes themselves live on a persistent Railway volume, not in the
-- database. "storageKey" is the path relative to the storage root and is
-- always generated on the server.

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'LINK',
                       ADD COLUMN     "storageKey" TEXT,
                       ADD COLUMN     "originalName" TEXT,
                       ADD COLUMN     "mimeType" TEXT,
                       ADD COLUMN     "sizeBytes" INTEGER;
