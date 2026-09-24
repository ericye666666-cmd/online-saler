/**
 * What the picker's phone needs from an order, in both of its modes.
 *
 * Kept apart from the screens so picking and packing agree on one shape: they
 * are two views of the same trolley, and a garment that reads one way while
 * being fetched and another way while being boxed is how a parcel ends up with
 * somebody else's shirt in it.
 */

export type PickerItem = {
  id: string;
  title: string;
  sizeLabel: string | null;
  barcode: string;
  imageUrl: string | null;
  locationCode: string;
};

/** One order as the packing view shows it: one card, one parcel. */
export type PackOrder = {
  id: string;
  orderNumber: string;
  /** For the screen: "自提 · Kinoo". Never printed — a label is read in Kenya. */
  destination: string;
  /** For the label: the node's own name, "Kinoo", with nothing composed onto it. */
  nodeName: string;
  isDelivery: boolean;
  items: PickerItem[];
  fulfillment?: {
    status: string;
    packingStartedAt?: string | null;
    packageCode?: string | null;
  } | null;
  /** Who the supervisor gave this parcel to, for the "waiting" empty state. */
  assignedPackerName?: string | null;
};
