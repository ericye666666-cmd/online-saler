/**
 * Types for the staging seed, so the policy parity test in apps/api can read
 * what the database is actually granted rather than trusting that the two lists
 * still agree.
 *
 * The seed itself stays plain JavaScript: it runs as `node seed-...mjs` inside
 * the migration job, where there is no TypeScript.
 */

export type SeedPermission = {
  code: string;
  module: string;
  scope: "MODULE" | "PAGE" | "ACTION";
  page?: string;
  action?: string;
  description: string;
};

export type SeedRole = {
  code: string;
  name: string;
  description: string;
  permissions: string[];
};

export declare const permissions: SeedPermission[];
export declare const roles: SeedRole[];

export declare const forbiddenGrants: Record<string, string[]>;
export declare const ROLE_GRANT_LEDGER_KEY: string;
export declare function defaultGrantsFor(role: SeedRole): string[];
export declare function planRoleBackfill(
  role: SeedRole,
  state: { exists: boolean; held: Set<string>; offered: Set<string> }
): { create: string[]; grant: string[]; offer: string[] };

export declare function seedStagingBaseline(
  prisma: unknown
): Promise<{ adminUserId: string; loginAccount: string; granted: Record<string, string[]> }>;
