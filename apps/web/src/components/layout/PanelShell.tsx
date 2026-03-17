import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelShellProps {
  title: string;
  icon?: ReactNode;
  badge?: string;
  badgeVariant?: "green" | "amber";
  headerAction?: ReactNode;
  loading?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function PanelShell({
  title,
  icon,
  badge,
  badgeVariant = "green",
  headerAction,
  loading,
  error,
  className,
  children,
}: PanelShellProps) {
  return (
    <div
      className={cn(
        "glass glass-shine glass-border-gradient animate-glass-in flex flex-col overflow-hidden rounded-2xl transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-border-hover hover:shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,45,123,0.15),inset_0_0_60px_rgba(255,45,123,0.02)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-cream">
          {icon && (
            <span className="text-neon-pink opacity-80">{icon}</span>
          )}
          {title}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                badgeVariant === "green" &&
                  "bg-[rgba(255,45,123,0.12)] text-neon-pink",
                badgeVariant === "amber" &&
                  "bg-[rgba(245,158,11,0.12)] text-amber"
              )}
            >
              {badge}
            </span>
          )}
          {headerAction}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 px-[18px] pb-[18px] pt-3.5">
        {loading ? (
          <div className="flex h-full items-center justify-center text-text-muted">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-pink" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            {/network|fetch/i.test(error) ? (
              <WifiOff className="h-10 w-10 text-text-muted opacity-40" />
            ) : (
              <span className="text-sm text-destructive-foreground">{error}</span>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
