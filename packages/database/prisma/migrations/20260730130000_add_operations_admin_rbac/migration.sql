CREATE TYPE "AdminUserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED');

CREATE TYPE "PermissionScope" AS ENUM ('MODULE', 'PAGE', 'ACTION');

ALTER TABLE "Permission"
ADD COLUMN "scope" "PermissionScope" NOT NULL DEFAULT 'ACTION',
ADD COLUMN "page" TEXT,
ADD COLUMN "action" TEXT;

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "loginAccount" TEXT NOT NULL,
  "phone" TEXT,
  "passwordHash" TEXT,
  "inviteTokenHash" TEXT,
  "inviteExpiresAt" TIMESTAMP(3),
  "status" "AdminUserStatus" NOT NULL DEFAULT 'ACTIVE',
  "linkedEmployeeId" TEXT,
  "lastLoginAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserRole" (
  "adminUserId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserRole_pkey" PRIMARY KEY ("adminUserId", "roleId")
);

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "AdminUser_loginAccount_key" ON "AdminUser"("loginAccount");
CREATE UNIQUE INDEX "AdminUser_phone_key" ON "AdminUser"("phone");
CREATE UNIQUE INDEX "AdminUser_linkedEmployeeId_key" ON "AdminUser"("linkedEmployeeId");
CREATE INDEX "AdminUser_status_createdAt_idx" ON "AdminUser"("status", "createdAt");
CREATE INDEX "AdminUser_linkedEmployeeId_idx" ON "AdminUser"("linkedEmployeeId");

ALTER TABLE "AdminUser"
ADD CONSTRAINT "AdminUser_linkedEmployeeId_fkey"
FOREIGN KEY ("linkedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserRole"
ADD CONSTRAINT "UserRole_adminUserId_fkey"
FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole"
ADD CONSTRAINT "UserRole_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
