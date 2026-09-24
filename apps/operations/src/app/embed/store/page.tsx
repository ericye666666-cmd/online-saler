import { StoreConsole } from "../../store/store-console";

/**
 * The store console with no workspace around it, for the store ERP to embed in
 * its own phone workbench. Same screen and same permissions as /store; the shell
 * is skipped because the host app supplies the frame.
 */
export default function Page() {
  return <StoreConsole />;
}
