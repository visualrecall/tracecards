import { useCallback } from "react";
import { useHost } from "./host";

/** An icon from the app's icon set (Lucide in Obsidian), drawn by the host. */
export function Icon({ name }: { name: string }) {
  const host = useHost();
  const draw = useCallback(
    (element: HTMLSpanElement | null) => {
      if (element) host.setIcon(element, name);
    },
    [host, name],
  );
  return <span ref={draw} className="tracecards-icon" aria-hidden="true" />;
}
