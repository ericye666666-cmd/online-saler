import { NewBatchPage } from "../product-batch-workbench-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return <NewBatchPage pilotEnabled={process.env.STAGING_PILOT_BATCH_ENABLED === "true"} />;
}
