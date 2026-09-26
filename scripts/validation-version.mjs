export function parseSemver(value) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function versionAtLeast(current, minimum) {
  const left = parseSemver(current);
  const right = parseSemver(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

export function packageVersion(packageText) {
  try { return JSON.parse(packageText).version || null; } catch { return null; }
}

export function healthVersion(healthText) {
  return healthText.match(/version:\s*["']([^"']+)["']/)?.[1] || null;
}
