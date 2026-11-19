"use client";

import { createContext } from "react";
import type { WorkspaceTheme } from "@/lib/workspace-theme";

export const WorkspaceThemeContext = createContext<WorkspaceTheme>("system");
