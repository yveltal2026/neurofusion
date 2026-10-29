/** JSONB reorders keys; compare content independently of object key insertion order. */
export function snapshotKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(snapshotKey).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${snapshotKey(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
