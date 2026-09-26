export interface PhotoAppearanceSettings {
  theme: "light" | "dark" | "system";
  compactMode: boolean;
  showPhotoCount: boolean;
}

export const DEFAULT_APPEARANCE_SETTINGS: PhotoAppearanceSettings = {
  theme: "light",
  compactMode: false,
  showPhotoCount: true,
};

export function applyAppearanceSettings(input: Partial<PhotoAppearanceSettings> | null | undefined) {
  if (typeof document === "undefined") return;
  const settings = { ...DEFAULT_APPEARANCE_SETTINGS, ...(input || {}) };
  const root = document.documentElement;
  const systemDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;
  root.dataset.photoTheme = settings.theme;
  root.dataset.photoResolvedTheme = resolved;
  root.dataset.photoCompact = settings.compactMode ? "true" : "false";
  root.dataset.photoCounts = settings.showPhotoCount ? "true" : "false";
}
