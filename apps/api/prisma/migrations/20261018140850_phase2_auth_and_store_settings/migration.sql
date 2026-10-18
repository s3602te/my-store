-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "closeTime" TEXT NOT NULL DEFAULT '13:00',
ADD COLUMN     "openTime" TEXT NOT NULL DEFAULT '06:00',
ADD COLUMN     "prepMinutes" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_staffUserId_idx" ON "StaffSession"("staffUserId");

-- CreateIndex
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 手動加入的資料完整性檢查:營業時間格式 HH:mm、備餐分鐘數範圍、登入失敗次數不為負
ALTER TABLE "Store" ADD CONSTRAINT "Store_openTime_format" CHECK ("openTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "Store" ADD CONSTRAINT "Store_closeTime_format" CHECK ("closeTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "Store" ADD CONSTRAINT "Store_hours_order" CHECK ("openTime" < "closeTime");
ALTER TABLE "Store" ADD CONSTRAINT "Store_prepMinutes_range" CHECK ("prepMinutes" >= 0 AND "prepMinutes" <= 240);
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_failedLoginCount_nonneg" CHECK ("failedLoginCount" >= 0);
