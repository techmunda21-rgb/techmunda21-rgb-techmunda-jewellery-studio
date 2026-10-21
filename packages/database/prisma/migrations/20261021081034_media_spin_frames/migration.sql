-- AlterTable
ALTER TABLE "product_media" ADD COLUMN     "media_kind" TEXT NOT NULL DEFAULT 'PHOTO',
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;
