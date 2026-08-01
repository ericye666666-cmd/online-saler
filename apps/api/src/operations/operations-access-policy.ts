import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export type PermissionScopeValue = "MODULE" | "PAGE" | "ACTION";

export type OperationsPermission = {
  code: string;
  module: string;
  scope: PermissionScopeValue;
  page?: string;
  action?: string;
  description: string;
};

export type OperationsRoleBlueprint = {
  code: string;
  name: string;
  description: string;
  permissions: string[];
};

const MODULES = [
  "product",
  "orders",
  "affiliate",
  "customer-service",
  "analytics",
  "system"
] as const;

const ACTIONS = [
  "view",
  "create",
  "edit",
  "approve",
  "publish",
  "delete",
  "export",
  "manage-users",
  "manage-roles"
] as const;

const modulePermissions: OperationsPermission[] = MODULES.map((module) => ({
  code: `module.${module}`,
  module,
  scope: "MODULE",
  page: undefined,
  action: undefined,
  description: `Access ${module} module.`
}));

const pagePermissions: OperationsPermission[] = [
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
    code: "page.product.details",
    module: "product",
    scope: "PAGE",
    page: "product-details",
    action: "view",
    description: "Open generated product detail review and approval controls."
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
  }
];

const actionPermissions: OperationsPermission[] = MODULES.flatMap((module) =>
  ACTIONS.map((action) => ({
    code: `action.${module}.${action}`,
    module,
    scope: "ACTION" as const,
    page: undefined,
    action,
    description: `Allow ${action} operation in ${module}.`
  }))
);

const orderWorkflowPermissions: OperationsPermission[] = [
  ["orders.view", "view", "View orders and their status history."],
  ["orders.assign-picker", "assign-picker", "Assign or reassign picking work."],
  ["orders.pick", "pick", "Claim picking work and verify item barcodes."],
  ["orders.pack", "pack", "Start and complete order packing."],
  ["orders.assign-rider", "assign-rider", "Assign an internal or external delivery rider."],
  ["orders.dispatch", "dispatch", "Confirm a parcel was handed to a rider."],
  ["orders.complete", "complete", "Confirm delivery or customer pickup completion."],
  ["orders.cancel", "cancel", "Cancel an eligible order."],
  ["orders.after-sale", "after-sale", "Manage after-sale ownership and status."],
  ["warehouse-locations.view", "view", "View warehouse locations and their products."],
  ["warehouse-locations.manage", "manage", "Create, disable, move, and print warehouse locations."]
].map(([code, action, description]) => ({
  code,
  module: code.startsWith("warehouse-locations") ? "system" : "orders",
  scope: "ACTION" as const,
  action,
  description
}));

export const OPERATIONS_PERMISSIONS = [
  ...modulePermissions,
  ...pagePermissions,
  ...actionPermissions,
  ...orderWorkflowPermissions
] as const satisfies readonly OperationsPermission[];

const allPermissionCodes = OPERATIONS_PERMISSIONS.map((permission) => permission.code);
const readAllModules = MODULES.map((module) => [`module.${module}`, `action.${module}.view`]).flat();

export const OPERATIONS_ROLE_BLUEPRINTS: OperationsRoleBlueprint[] = [
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
    permissions: uniquePermissionCodes([
      ...readAllModules,
      "page.product.digitalization",
      "page.product.control",
      "page.product.details",
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
    permissions: [
      "module.orders",
      "page.orders.workbench",
      "page.orders.all",
      "page.orders.exceptions",
      "action.orders.view",
      "orders.view",
      "orders.pick",
      "orders.pack",
      "orders.dispatch",
      "orders.complete",
      "warehouse-locations.view"
    ]
  },
  {
    code: "ORDER_OPERATIONS",
    name: "Order Operations",
    description: "Order review, payment status follow-up, and order exception handling.",
    permissions: [
      "module.orders",
      "page.orders.workbench",
      "page.orders.all",
      "page.orders.after-sale",
      "page.orders.exceptions",
      "action.orders.view",
      "action.orders.edit",
      "action.orders.approve",
      "action.orders.export",
      "orders.view",
      "orders.assign-picker",
      "orders.assign-rider",
      "orders.cancel",
      "orders.after-sale"
    ]
  },
  {
    code: "AFFILIATE_OPERATIONS",
    name: "Affiliate Operations",
    description: "Affiliate attribution and commission operation.",
    permissions: [
      "module.affiliate",
      "action.affiliate.view",
      "action.affiliate.edit",
      "action.affiliate.approve",
      "action.affiliate.export"
    ]
  },
  {
    code: "CUSTOMER_SERVICE",
    name: "Customer Service",
    description: "Customer support, return intake, and delivery exception handling.",
    permissions: [
      "module.customer-service",
      "module.orders",
      "page.orders.all",
      "page.orders.after-sale",
      "action.customer-service.view",
      "action.customer-service.create",
      "action.customer-service.edit",
      "action.orders.view",
      "orders.view",
      "orders.after-sale"
    ]
  },
  {
    code: "FINANCE",
    name: "Finance",
    description: "Payment, payout, commission, and export access.",
    permissions: [
      "module.orders",
      "module.affiliate",
      "module.analytics",
      "action.orders.view",
      "orders.view",
      "action.orders.export",
      "action.affiliate.view",
      "action.affiliate.approve",
      "action.affiliate.export",
      "action.analytics.view",
      "action.analytics.export"
    ]
  },
  {
    code: "DATA_ANALYST",
    name: "Data Analyst",
    description: "Read and export operational analytics.",
    permissions: uniquePermissionCodes([
      ...readAllModules,
      "action.analytics.export"
    ])
  }
];

export const STAGING_SUPER_ADMIN = {
  id: "00000000-0000-4000-9000-000000000043",
  loginAccount: "superadmin",
  email: "superadmin@online-saler.local",
  name: "Staging Super Admin",
  phone: "+254700000043",
  status: "ACTIVE",
  roleCode: "SUPER_ADMIN",
  linkedEmployee: {
    id: "00000000-0000-4000-8000-000000000001",
    employeeCode: "STAGING-TEST-001",
    name: "Staging Product Operator",
    status: "ACTIVE"
  },
  defaultPassword: "ChangeMe43!"
} as const;

export function uniquePermissionCodes(codes: readonly string[]): string[] {
  return [...new Set(codes)].sort();
}

export function hasOperationsPermission(permissionCodes: readonly string[], required: string): boolean {
  return permissionCodes.includes(required);
}

export function rolePermissionCodes(roleCodes: readonly string[]): string[] {
  const roleSet = new Set(roleCodes);
  const codes = OPERATIONS_ROLE_BLUEPRINTS
    .filter((role) => roleSet.has(role.code))
    .flatMap((role) => role.permissions);
  return uniquePermissionCodes(codes);
}

export function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const digest = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const [algorithm, iterations, salt, digest] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !digest) return false;
  const expected = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
  const actual = Buffer.from(digest, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function inviteTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
