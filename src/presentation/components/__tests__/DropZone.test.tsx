import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseDropzone = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: vi.fn((cb: (...args: unknown[]) => unknown) => cb),
    cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  };
});

vi.mock("react-dropzone", () => ({
  useDropzone: mockUseDropzone,
}));

import { DropZone } from "../DropZone";

describe("DropZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDropzone.mockReturnValue({
      getRootProps: vi.fn(() => ({})),
      getInputProps: vi.fn(() => ({})),
      isDragActive: false,
    });
  });

  it("uses the 2GB video size limit for .mov files with empty MIME type", () => {
    DropZone({ onFilesAccepted: vi.fn() });

    const validator = mockUseDropzone.mock.calls[0][0].validator as (
      file: File,
    ) => { code: string; message: string } | null;

    const file = {
      name: "clip.mov",
      type: "",
      size: 101 * 1024 * 1024,
    } as File;

    expect(validator(file)).toBeNull();
  });
});
