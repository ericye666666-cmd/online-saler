import assert from "node:assert/strict";
import test from "node:test";

test("deployment baseline preserves edited access and commission records in PostgreSQL", { timeout: 60_000 }, async () => {
  const databaseUrl = process.env.MVP_INTEGRATION_DATABASE_URL;
  assert.ok(databaseUrl, "MVP_INTEGRATION_DATABASE_URL must identify a disposable local test database.");
  const target = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /test/i);
  process.env.DATABASE_URL = databaseUrl;
  const { prisma } = await import("@online-saler/database");
  const { seedStagingBaseline } = await import("../../packages/database/prisma/seed-staging-test-employee.mjs");
  const rollback = new Error("ROLL_BACK_DISPOSABLE_BASELINE_TEST");
  let verified = false;
  try {
    await prisma.$transaction(async (tx) => {
      await seedStagingBaseline(tx);
      const admin = await tx.adminUser.findUniqueOrThrow({ where: { loginAccount: "superadmin" } });
      assert.ok(admin.linkedEmployeeId);
      const role = await tx.role.findUniqueOrThrow({ where: { code: "PRODUCT_DIGITIZATION" } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.role.update({ where: { id: role.id }, data: { name: "Owner restricted this role" } });
      await tx.userRole.deleteMany({ where: { adminUserId: admin.id } });
      await tx.adminUser.update({ where: { id: admin.id }, data: { status: "DISABLED", passwordHash: "changed-hash-sentinel" } });
      await tx.employee.update({ where: { id: admin.linkedEmployeeId }, data: { status: "LEFT" } });
      await tx.systemSetting.update({ where: { key: "affiliate.defaultCommissionRateBps" }, data: { valueJson: 3000 } });
      await tx.affiliate.update({ where: { affiliateCode: "DL-AFF-001" }, data: { commissionRateBps: 1700, status: "DISABLED" } });
      await tx.affiliateLink.update({ where: { linkCode: "DL-AFF-001-STORE-WA" }, data: { campaign: "owner-campaign" } });
      await seedStagingBaseline(tx);
      await seedStagingBaseline(tx);
      const preserved = await tx.adminUser.findUniqueOrThrow({ where: { id: admin.id }, include: { linkedEmployee: true, roles: true } });
      assert.equal(preserved.status, "DISABLED");
      assert.equal(preserved.passwordHash, "changed-hash-sentinel");
      assert.equal(preserved.linkedEmployee?.status, "LEFT");
      assert.equal(preserved.roles.length, 0);
      assert.equal(await tx.rolePermission.count({ where: { roleId: role.id } }), 0);
      assert.equal((await tx.role.findUniqueOrThrow({ where: { id: role.id } })).name, "Owner restricted this role");
      assert.equal((await tx.systemSetting.findUniqueOrThrow({ where: { key: "affiliate.defaultCommissionRateBps" } })).valueJson, 3000);
      const affiliate = await tx.affiliate.findUniqueOrThrow({ where: { affiliateCode: "DL-AFF-001" } });
      assert.equal(affiliate.commissionRateBps, 1700);
      assert.equal(affiliate.status, "DISABLED");
      assert.equal((await tx.affiliateLink.findUniqueOrThrow({ where: { linkCode: "DL-AFF-001-STORE-WA" } })).campaign, "owner-campaign");
      verified = true;
      throw rollback;
    }, { timeout: 45_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
  assert.equal(verified, true);
});
