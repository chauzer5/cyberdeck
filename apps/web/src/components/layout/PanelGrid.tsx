import type { ReactNode } from "react";

interface PanelGridProps {
  children: ReactNode;
}

export function PanelGrid({ children }: PanelGridProps) {
  return (
    <div className="grid grid-rows-[auto] auto-rows-[minmax(180px,auto)] grid-cols-1 gap-3.5 p-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}
