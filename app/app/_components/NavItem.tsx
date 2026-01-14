"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavItem({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();

  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={[
        "block rounded-2xl px-4 py-3 text-sm font-semibold ring-1 transition",
        active
          ? "text-white ring-white/10"
          : "bg-black/20 text-white/80 ring-white/10 hover:bg-white/10 hover:text-white",
      ].join(" ")}
      style={
        active
          ? {
              background: `linear-gradient(135deg, rgba(var(--accent-rgb),0.22), rgba(var(--accent2-rgb),0.16))`,
            }
          : undefined
      }
    >
      {label}
    </Link>
  );
}
