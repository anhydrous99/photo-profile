import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("DropZone", () => {
  const originalStorageBackend = process.env.NEXT_PUBLIC_STORAGE_BACKEND;
  const originalVideoEnabled = process.env.NEXT_PUBLIC_VIDEO_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDropzone.mockReturnValue({
      getRootProps: vi.fn(() => ({})),
      getInputProps: vi.fn(() => ({})),
      isDragActive: false,
    });
    process.env.NEXT_PUBLIC_STORAGE_BACKEND = "s3";
    delete process.env.NEXT_PUBLIC_VIDEO_ENABLED;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalStorageBackend === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_BACKEND;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_BACKEND = originalStorageBackend;
    }
    if (originalVideoEnabled === undefined) {
      delete process.env.NEXT_PUBLIC_VIDEO_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_VIDEO_ENABLED = originalVideoEnabled;
    }
  });

  async function renderDropZone() {
    const { DropZone } = await import("../DropZone");
    DropZone({ onFilesAccepted: vi.fn() });
    return mockUseDropzone.mock.calls[0][0];
  }

  it("accepts videos by default for S3 uploads", async () => {
    const options = await renderDropZone();

    expect(options.accept).toMatchObject({
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
    });
  });

  it("omits videos when explicitly disabled", async () => {
    process.env.NEXT_PUBLIC_VIDEO_ENABLED = "false";
    vi.resetModules();

    const options = await renderDropZone();

    expect(options.accept).not.toHaveProperty("video/quicktime");
  });

  it("uses the 2GB video size limit for .mov files with empty MIME type", async () => {
    const options = await renderDropZone();

    const validator = options.validator as (
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
