import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadVideoMultipart } from "../uploadVideoMultipart";

interface XhrMock {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  upload: {
    addEventListener: ReturnType<typeof vi.fn>;
  };
  addEventListener: ReturnType<typeof vi.fn>;
  getResponseHeader: ReturnType<typeof vi.fn>;
  status: number;
  timeout: number;
}

function flushAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("uploadVideoMultipart", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let xhrMock: XhrMock;

  beforeEach(() => {
    mockFetch = vi.fn();
    xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      getResponseHeader: vi.fn((name: string) =>
        name === "ETag" ? '"etag-1"' : null,
      ),
      status: 200,
      timeout: 0,
    };

    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        constructor() {
          return xhrMock;
        }
      } as unknown as typeof XMLHttpRequest,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("infers video/quicktime for .mov files when the browser reports an empty MIME type", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            photoId: "video-id",
            key: "originals/video-id/original.mov",
            uploadId: "upload-id",
            partSize: 10,
            parts: [{ partNumber: 1, url: "https://signed.example.com/1" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoId: "video-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const file = new File(["video"], "clip.mov", { type: "" });
    const uploadPromise = uploadVideoMultipart({ file });

    await flushAsyncWork();

    const loadHandler = xhrMock.addEventListener.mock.calls.find(
      ([event]) => event === "load",
    )?.[1] as (() => void) | undefined;
    expect(loadHandler).toBeDefined();
    loadHandler?.();

    const result = await uploadPromise;

    expect(result).toEqual({ photoId: "video-id", status: "processing" });
    const createBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(createBody).toMatchObject({
      filename: "clip.mov",
      contentType: "video/quicktime",
      fileSize: file.size,
    });
    expect(xhrMock.open).toHaveBeenCalledWith(
      "PUT",
      "https://signed.example.com/1",
      true,
    );

    const completeBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(completeBody).toMatchObject({
      photoId: "video-id",
      key: "originals/video-id/original.mov",
      uploadId: "upload-id",
      originalFilename: "clip.mov",
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
  });
});
