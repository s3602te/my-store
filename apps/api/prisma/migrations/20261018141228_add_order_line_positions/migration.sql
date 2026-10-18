-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItemOption" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;
