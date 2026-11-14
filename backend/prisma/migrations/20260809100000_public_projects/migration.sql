-- Public project visibility.
--
-- Opt-in per project. A project is readable by an unauthenticated visitor only
-- when this flag is true, its workspace is also published, and it is not
-- archived. Existing rows default to false, so nothing becomes visible as a
-- result of this migration.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Project_isPublic_idx" ON "Project"("isPublic");
