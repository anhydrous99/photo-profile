"use client";

import type { ExifData } from "@/domain/entities/Photo";

interface ExifPanelProps {
  exifData: ExifData | null;
  visible: boolean;
}

function formatCamera(
  make: string | null,
  model: string | null,
): string | null {
  if (!model && !make) return null;
  if (!model) return make;
  if (!make) return model;
  // If model already includes make, just show model
  if (model.startsWith(make)) return model;
  return `${make} ${model}`;
}

function formatDate(dateTaken: string): string {
  return new Date(dateTaken).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ExifField {
  label: string;
  value: string;
}

function getExifFields(exifData: ExifData): ExifField[] {
  const fields: ExifField[] = [];

  const camera = formatCamera(exifData.cameraMake, exifData.cameraModel);
  if (camera) fields.push({ label: "Camera", value: camera });

  if (exifData.lens) fields.push({ label: "Lens", value: exifData.lens });

  if (exifData.focalLength != null)
    fields.push({ label: "Focal Length", value: `${exifData.focalLength}mm` });

  if (exifData.aperture != null)
    fields.push({ label: "Aperture", value: `f/${exifData.aperture}` });

  if (exifData.shutterSpeed)
    fields.push({ label: "Shutter", value: exifData.shutterSpeed });

  if (exifData.iso != null)
    fields.push({ label: "ISO", value: `ISO ${exifData.iso}` });

  if (exifData.whiteBalance)
    fields.push({ label: "White Balance", value: exifData.whiteBalance });

  if (exifData.meteringMode)
    fields.push({ label: "Metering", value: exifData.meteringMode });

  if (exifData.flash) fields.push({ label: "Flash", value: exifData.flash });

  if (exifData.dateTaken)
    fields.push({ label: "Date", value: formatDate(exifData.dateTaken) });

  return fields;
}

export function ExifPanel({ exifData, visible }: ExifPanelProps) {
  const hasData = exifData !== null && getExifFields(exifData).length > 0;

  return (
    <div
      className={`fixed right-0 bottom-0 left-0 z-50 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-6 pt-12 pb-4 transition-transform duration-300 ease-out ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      {hasData ? (
        <div className="mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-2">
          {getExifFields(exifData!).map((field) => (
            <div key={field.label} className="min-w-[80px]">
              <div className="text-xs text-gray-400">{field.label}</div>
              <div className="text-sm font-medium text-white">
                {field.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-gray-400">
          No camera data available
        </p>
      )}
    </div>
  );
}
