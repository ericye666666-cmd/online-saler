import * as React from "react";

// The same query Tailwind's `md:` uses (48rem in Tailwind 4). The sidebar picks
// its desktop or phone form here, and CSS hides the desktop form below `md`, so
// the two have to agree on where that line is. Comparing window.innerWidth to
// 768 pixels did not: a browser with a larger default font size makes 48rem
// wider than 768px, and a zoomed window can round across it. In between, this
// rendered the desktop sidebar while CSS hid it, and the toggle opened nothing.
export const MOBILE_QUERY = "not all and (min-width: 48rem)";

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
