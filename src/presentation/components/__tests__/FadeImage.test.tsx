import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/imageLoader", () => ({
  getClientImageUrl: vi.fn(
    (photoId: string, filename: string) => `/api/images/${photoId}/${filename}`,
  ),
  buildSrcSet: vi.fn(() => "/api/images/test/300w.webp 300w"),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: vi.fn((init: unknown) => [
      typeof init === "function" ? (init as () => unknown)() : init,
      vi.fn(),
    ]),
    cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  };
});

import { FadeImage } from "../FadeImage";

interface TestElement {
  type: unknown;
  props: Record<string, unknown>;
}

function renderFadeImage(props: Parameters<typeof FadeImage>[0]): TestElement {
  return FadeImage(props) as unknown as TestElement;
}

function getChildren(el: TestElement): TestElement[] {
  return [el.props.children].flat().filter(Boolean) as TestElement[];
}

describe("FadeImage", () => {
  const defaultProps = {
    photoId: "test-photo-id",
    alt: "Test photo",
    sizes: "(max-width: 768px) 100vw, 50vw",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("image download protections", () => {
    it("wrapper div has onContextMenu handler that calls preventDefault", () => {
      const element = renderFadeImage(defaultProps);

      expect(element.props.onContextMenu).toBeTypeOf("function");

      const mockEvent = { preventDefault: vi.fn() };
      (element.props.onContextMenu as (e: unknown) => void)(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalledOnce();
    });

    it("wrapper div has onDragStart handler that calls preventDefault", () => {
      const element = renderFadeImage(defaultProps);

      expect(element.props.onDragStart).toBeTypeOf("function");

      const mockEvent = { preventDefault: vi.fn() };
      (element.props.onDragStart as (e: unknown) => void)(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalledOnce();
    });

    it("wrapper div has select-none in className", () => {
      const element = renderFadeImage(defaultProps);
      expect(element.props.className).toContain("select-none");
    });

    it("wrapper div has WebkitTouchCallout: none style", () => {
      const element = renderFadeImage(defaultProps);
      expect(element.props.style).toEqual(
        expect.objectContaining({ WebkitTouchCallout: "none" }),
      );
    });

    it("img inside picture has draggable={false} prop", () => {
      const element = renderFadeImage(defaultProps);
      const children = getChildren(element);

      const pictureEl = children.find((c) => c.type === "picture");
      expect(pictureEl).toBeDefined();

      const pictureChildren = getChildren(pictureEl!);
      const imgEl = pictureChildren.find((c) => c.type === "img");
      expect(imgEl).toBeDefined();
      expect(imgEl!.props.draggable).toBe(false);
    });
  });

  describe("picture element", () => {
    it("contains AVIF source and WebP img", () => {
      const element = renderFadeImage(defaultProps);
      const children = getChildren(element);

      const pictureEl = children.find((c) => c.type === "picture");
      expect(pictureEl).toBeDefined();

      const pictureChildren = getChildren(pictureEl!);
      const sourceEl = pictureChildren.find((c) => c.type === "source");
      expect(sourceEl).toBeDefined();
      expect(sourceEl!.props.type).toBe("image/avif");

      const imgEl = pictureChildren.find((c) => c.type === "img");
      expect(imgEl).toBeDefined();
      expect(imgEl!.props.src as string).toContain(".webp");
    });
  });

  describe("blur placeholder", () => {
    it("does NOT have onContextMenu, onDragStart, or draggable handlers", () => {
      const element = renderFadeImage({
        ...defaultProps,
        blurDataUrl: "data:image/jpeg;base64,abc123",
      });

      const children = getChildren(element);
      const blurImg = children.find((c) => c.type === "img");

      expect(blurImg).toBeDefined();
      expect(blurImg!.props.onContextMenu).toBeUndefined();
      expect(blurImg!.props.onDragStart).toBeUndefined();
      expect(blurImg!.props.draggable).toBeUndefined();
    });
  });
});
