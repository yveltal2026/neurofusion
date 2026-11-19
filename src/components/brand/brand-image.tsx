"use client";

import Image from "next/image";
import { useContext } from "react";
import { WorkspaceThemeContext } from "@/components/workspace-theme-context";

export function BrandImage({
  light,
  dark,
  tone,
  alt,
  width,
  height,
  className,
}: {
  light: string;
  dark: string;
  tone: "auto" | "deep";
  alt: string;
  width: number;
  height: number;
  className: string;
}) {
  const theme = useContext(WorkspaceThemeContext);
  return (
    <picture className={className}>
      {tone === "auto" ? <source media="print" srcSet={light} /> : null}
      {tone === "auto" && theme === "system" ? (
        <source media="(prefers-color-scheme: dark)" srcSet={dark} />
      ) : null}
      <Image
        src={tone === "deep" || theme === "dark" ? dark : light}
        alt={alt}
        width={width}
        height={height}
        unoptimized
      />
    </picture>
  );
}
