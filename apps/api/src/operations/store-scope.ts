import { ForbiddenException } from "@nestjs/common";
import { FulfillmentNodeType, prisma } from "@online-saler/database";

/**
 * Which store a signed-in account is confined to.
 *
 * Store staff see their own store and nothing else. An account's store is the
 * home node of the employee linked to it — the 归属门店 column on 账号管理. An
 * account with no home node (不限（仓库 / 总部）) is warehouse or head office
 * and sees every node.
 *
 * Only a STORE home node confines. The warehouse is the place every parcel
 * starts from, so an account whose home node was set to the warehouse keeps
 * seeing the whole order centre rather than losing every order that is not yet
 * routed anywhere.
 */
export type StoreScope = { id: string; name: string } | null;

type SessionLike = {
  adminUser?: { linkedEmployee?: { homeNodeId?: string | null } | null } | null;
} | null | undefined;

export async function storeScopeFor(session: SessionLike): Promise<StoreScope> {
  const homeNodeId = session?.adminUser?.linkedEmployee?.homeNodeId;
  if (!homeNodeId) return null;
  const node = await prisma.fulfillmentNode.findUnique({
    where: { id: homeNodeId },
    select: { id: true, name: true, type: true }
  });
  if (!node || node.type !== FulfillmentNodeType.STORE) return null;
  return { id: node.id, name: node.name };
}

/**
 * The node a list should be narrowed to. A confined account always gets its
 * own store; asking for another one is refused rather than quietly swapped, so
 * a screen can never believe it is showing Thogoto while it shows Kinoo.
 */
export function scopedNodeId(scope: StoreScope, requested?: string | null): string | undefined {
  const asked = requested?.trim() || undefined;
  if (!scope) return asked;
  if (asked && asked !== scope.id) throw otherStore(scope);
  return scope.id;
}

/**
 * The node an order is going to. The fulfillment record is what the store end
 * reads; the order's own column is the fallback for a task that was created
 * before its node was copied onto it.
 */
export function orderNodeId(order: {
  fulfillmentNodeId?: string | null;
  fulfillment?: { fulfillmentNodeId?: string | null } | null;
}): string | null {
  return order.fulfillment?.fulfillmentNodeId ?? order.fulfillmentNodeId ?? null;
}

export function assertOrderInScope(scope: StoreScope, order: Parameters<typeof orderNodeId>[0]) {
  if (!scope) return;
  if (orderNodeId(order) !== scope.id) throw otherStore(scope);
}

function otherStore(scope: NonNullable<StoreScope>) {
  return new ForbiddenException(`This account belongs to ${scope.name} and can only see ${scope.name}'s orders.`);
}
