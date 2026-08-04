import { pbkdf2Sync, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const modules = ["product", "orders", "affiliate", "customer-service", "analytics", "system"];
const actions = ["view", "create", "edit", "approve", "publish", "delete", "export", "manage-users", "manage-roles"];

const permissions = [
  ...modules.map((module) => ({
    code: `module.${module}`,
    module,
    scope: "MODULE",
    description: `Access ${module} module.`
  })),
  {
    code: "page.orders.workbench",
    module: "orders",
    scope: "PAGE",
    page: "orders-workbench",
    action: "view",
    description: "Open the order workbench."
  },
  {
    code: "page.orders.all",
    module: "orders",
    scope: "PAGE",
    page: "orders-all",
    action: "view",
    description: "Open all orders."
  },
  {
    code: "page.orders.after-sale",
    module: "orders",
    scope: "PAGE",
    page: "orders-after-sale",
    action: "view",
    description: "Open after-sale orders."
  },
  {
    code: "page.orders.exceptions",
    module: "orders",
    scope: "PAGE",
    page: "orders-exceptions",
    action: "view",
    description: "Open exception orders."
  },
  {
    code: "page.system.warehouse-locations",
    module: "system",
    scope: "PAGE",
    page: "warehouse-locations",
    action: "view",
    description: "Open warehouse location configuration."
  },
  {
    code: "page.product.digitalization",
    module: "product",
    scope: "PAGE",
    page: "product-digitalization",
    action: "view",
    description: "Open the product digitization workspace."
  },
  {
    code: "page.product.control",
    module: "product",
    scope: "PAGE",
    page: "product-control",
    action: "view",
    description: "Open product review, pricing, warehouse placement, and publish controls."
  },
  {
    code: "page.system.accounts",
    module: "system",
    scope: "PAGE",
    page: "accounts",
    action: "view",
    description: "Open admin account management."
  },
  {
    code: "page.system.roles",
    module: "system",
    scope: "PAGE",
    page: "roles",
    action: "view",
    description: "Open role management."
  },
  {
    code: "page.system.permissions",
    module: "system",
    scope: "PAGE",
    page: "permissions",
    action: "view",
    description: "Open permission matrix."
  },
  ...modules.flatMap((module) =>
    actions.map((action) => ({
      code: `action.${module}.${action}`,
      module,
      scope: "ACTION",
      action,
      description: `Allow ${action} operation in ${module}.`
    }))
  ),
  ...[
    ["orders.view", "orders", "view", "View orders and their status history."],
    ["orders.assign-picker", "orders", "assign-picker", "Assign or reassign picking work."],
    ["orders.pick", "orders", "pick", "Claim picking work and verify item barcodes."],
    ["orders.pack", "orders", "pack", "Start and complete order packing."],
    ["orders.assign-rider", "orders", "assign-rider", "Assign an internal or external delivery rider."],
    ["orders.dispatch", "orders", "dispatch", "Confirm a parcel was handed to a rider."],
    ["orders.complete", "orders", "complete", "Confirm delivery or customer pickup completion."],
    ["orders.cancel", "orders", "cancel", "Cancel an eligible order."],
    ["orders.after-sale", "orders", "after-sale", "Manage after-sale ownership and status."],
    ["warehouse-locations.view", "system", "view", "View warehouse locations and their products."],
    ["warehouse-locations.manage", "system", "manage", "Create, disable, move, and print warehouse locations."]
  ].map(([code, module, action, description]) => ({ code, module, scope: "ACTION", action, description }))
];

const allPermissionCodes = permissions.map((permission) => permission.code);
const readAllModules = modules.flatMap((module) => [`module.${module}`, `action.${module}.view`]);

function unique(codes) {
  return [...new Set(codes)].sort();
}

const roles = [
  {
    code: "SUPER_ADMIN",
    name: "Super Admin",
    description: "Full system administration access.",
    permissions: allPermissionCodes
  },
  {
    code: "PROJECT_MANAGER",
    name: "Project Manager",
    description: "Manage daily operation flow without changing system users or roles.",
    permissions: unique([
      ...readAllModules,
      "page.product.digitalization",
      "page.product.control",
      "page.orders.workbench",
      "page.orders.all",
      "page.orders.after-sale",
      "page.orders.exceptions",
      "page.system.warehouse-locations",
      "action.product.edit",
      "action.product.approve",
      "action.product.publish",
      "action.orders.edit",
      "action.analytics.export",
      "orders.view",
      "orders.assign-picker",
      "orders.pick",
      "orders.pack",
      "orders.assign-rider",
      "orders.dispatch",
      "orders.complete",
      "orders.cancel",
      "orders.after-sale",
      "warehouse-locations.view",
      "warehouse-locations.manage"
    ])
  },
  {
    code: "PRODUCT_DIGITIZATION",
    name: "Product Digitization",
    description: "Upload, AI review, manual calibration, barcode, and product publishing work.",
    permissions: [
      "module.product",
      "page.product.digitalization",
      "page.product.control",
      "action.product.view",
      "action.product.create",
      "action.product.edit",
      "action.product.approve",
      "action.product.publish"
    ]
  },
  {
    code: "WAREHOUSE_FULFILLMENT",
    name: "Order Fulfillment",
    description: "Order-level picking, packing, pickup, and delivery handoff work.",
    permissions: ["module.orders", "page.orders.workbench", "page.orders.all", "page.orders.exceptions", "action.orders.view", "orders.view", "orders.pick", "orders.pack", "orders.dispatch", "orders.complete", "warehouse-locations.view"]
  },
  {
    code: "ORDER_OPERATIONS",
    name: "Order Operations",
    description: "Order review, payment status follow-up, and order exception handling.",
    permissions: ["module.orders", "page.orders.workbench", "page.orders.all", "page.orders.after-sale", "page.orders.exceptions", "action.orders.view", "action.orders.edit", "action.orders.approve", "action.orders.export", "orders.view", "orders.assign-picker", "orders.assign-rider", "orders.cancel", "orders.after-sale"]
  },
  {
    code: "AFFILIATE_OPERATIONS",
    name: "Affiliate Operations",
    description: "Affiliate attribution and commission operation.",
    permissions: ["module.affiliate", "action.affiliate.view", "action.affiliate.edit", "action.affiliate.approve", "action.affiliate.export"]
  },
  {
    code: "CUSTOMER_SERVICE",
    name: "Customer Service",
    description: "Customer support, return intake, and delivery exception handling.",
    permissions: ["module.customer-service", "module.orders", "page.orders.all", "page.orders.after-sale", "action.customer-service.view", "action.customer-service.create", "action.customer-service.edit", "action.orders.view", "orders.view", "orders.after-sale"]
  },
  {
    code: "FINANCE",
    name: "Finance",
    description: "Payment, payout, commission, and export access.",
    permissions: ["module.orders", "module.affiliate", "module.analytics", "action.orders.view", "action.orders.export", "action.affiliate.view", "action.affiliate.approve", "action.affiliate.export", "action.analytics.view", "action.analytics.export"]
  },
  {
    code: "DATA_ANALYST",
    name: "Data Analyst",
    description: "Read and export operational analytics.",
    permissions: unique([...readAllModules, "action.analytics.export"])
  }
];

const linkedEmployee = {
  id: "00000000-0000-4000-8000-000000000001",
  employeeCode: "STAGING-TEST-001",
  name: "Staging Product Operator",
  status: "ACTIVE"
};

const superAdmin = {
  id: "00000000-0000-4000-9000-000000000043",
  loginAccount: "superadmin",
  email: "superadmin@online-saler.local",
  name: "Staging Super Admin",
  phone: "+254700000043",
  status: "ACTIVE",
  roleCode: "SUPER_ADMIN",
  password: process.env.OPERATIONS_SUPER_ADMIN_PASSWORD || "ChangeMe43!"
};

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const digest = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

try {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        scope: permission.scope,
        page: permission.page,
        action: permission.action,
        description: permission.description
      },
      create: permission
    });
  }

  for (const role of roles) {
    const savedRole = await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description
      }
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: savedRole.id } });
    for (const permissionCode of role.permissions) {
      const permission = await prisma.permission.findUnique({ where: { code: permissionCode } });
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: {
          roleId: savedRole.id,
          permissionId: permission.id
        }
      });
    }
  }

  const employee = await prisma.employee.upsert({
    where: { employeeCode: linkedEmployee.employeeCode },
    update: {
      name: linkedEmployee.name,
      status: linkedEmployee.status
    },
    create: linkedEmployee
  });

  const adminUser = await prisma.adminUser.upsert({
    where: { loginAccount: superAdmin.loginAccount },
    update: {
      name: superAdmin.name,
      email: superAdmin.email,
      phone: superAdmin.phone,
      status: superAdmin.status,
      linkedEmployeeId: employee.id
    },
    create: {
      id: superAdmin.id,
      name: superAdmin.name,
      email: superAdmin.email,
      loginAccount: superAdmin.loginAccount,
      phone: superAdmin.phone,
      passwordHash: hashPassword(superAdmin.password),
      status: superAdmin.status,
      linkedEmployeeId: employee.id
    }
  });

  const role = await prisma.role.findUnique({ where: { code: superAdmin.roleCode } });
  if (role) {
    await prisma.userRole.upsert({
      where: {
        adminUserId_roleId: {
          adminUserId: adminUser.id,
          roleId: role.id
        }
      },
      update: {},
      create: {
        adminUserId: adminUser.id,
        roleId: role.id
      }
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: "affiliate.defaultCommissionRateBps" },
    update: { valueJson: 1000, scope: "GLOBAL" },
    create: {
      key: "affiliate.defaultCommissionRateBps",
      valueJson: 1000,
      scope: "GLOBAL"
    }
  });

  const affiliate = await prisma.affiliate.upsert({
    where: { affiliateCode: "DL-AFF-001" },
    update: {
      slug: "staging-affiliate",
      displayName: "Staging Affiliate",
      phone: "+254700000046",
      email: "affiliate@online-saler.local",
      status: "ACTIVE",
      commissionRateBps: 1000,
      disabledAt: null
    },
    create: {
      affiliateCode: "DL-AFF-001",
      slug: "staging-affiliate",
      displayName: "Staging Affiliate",
      phone: "+254700000046",
      email: "affiliate@online-saler.local",
      status: "ACTIVE",
      commissionRateBps: 1000
    }
  });

  await prisma.affiliateLink.upsert({
    where: { linkCode: "DL-AFF-001-STORE-WA" },
    update: {
      affiliateId: affiliate.id,
      type: "STORE",
      landingPath: "/",
      source: "whatsapp",
      placement: "direct-message",
      campaign: "staging"
    },
    create: {
      affiliateId: affiliate.id,
      linkCode: "DL-AFF-001-STORE-WA",
      type: "STORE",
      landingPath: "/",
      source: "whatsapp",
      placement: "direct-message",
      campaign: "staging"
    }
  });

  console.log(`Staging admin access baseline ready: ${adminUser.loginAccount}`);
} finally {
  await prisma.$disconnect();
}
