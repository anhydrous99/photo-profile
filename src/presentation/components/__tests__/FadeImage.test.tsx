import { describe, it, expect, vi, beforeEach } from "vitest";

const mockImage = vi.hoisted(() => vi.fn());

vi.mock("next/image", () => ({
  default: mockImage,
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

    it("Image component has draggable={false} prop", () => {
      const element = renderFadeImage(defaultProps);
      const children = getChildren(element);

      const imageElement = children.find((c) => c.type === mockImage);

      expect(imageElement).toBeDefined();
      expect(imageElement!.props.draggable).toBe(false);
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
