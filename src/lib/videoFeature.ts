export function resolveVideoEnabled(params: {
  value?: boolean | string;
  storageBackend?: string;
}): boolean {
  const { value, storageBackend } = params;

  if (typeof value === "boolean") return value;

  const normalized = value?.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  if (normalized === "true" || normalized === "1") return true;

  return storageBackend !== "filesystem";
}
