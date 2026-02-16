import type { Photo } from "@/domain/entities";

interface StatusBadgeProps {
  status: Photo["status"];
}

/**
 * Status badge component
 * Displays photo processing status with color coding
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    processing: "bg-yellow-100 text-yellow-800",
    ready: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
