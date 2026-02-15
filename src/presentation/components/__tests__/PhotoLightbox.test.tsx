import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLightbox = vi.hoisted(() => vi.fn());
const mockIsImageSlide = vi.hoisted(() => vi.fn());
const mockZoom = vi.hoisted(() => vi.fn());
const mockFullscreen = vi.hoisted(() => vi.fn());
const mockCaptions = vi.hoisted(() => vi.fn());

vi.mock("yet-another-react-lightbox", () => ({
  default: mockLightbox,
  isImageSlide: mockIsImageSlide,
}));

vi.mock("yet-another-react-lightbox/plugins/zoom", () => ({
  default: mockZoom,
}));

vi.mock("yet-another-react-lightbox/plugins/fullscreen", () => ({
  default: mockFullscreen,
}));

vi.mock("yet-another-react-lightbox/plugins/captions", () => ({
  default: mockCaptions,
}));

vi.mock("yet-another-react-lightbox/styles.css", () => ({}));
vi.mock("yet-another-react-lightbox/plugins/captions.css", () => ({}));

vi.mock("@/lib/imageLoader", () => ({
  getClientImageUrl: vi.fn(
    (photoId: string, filename: string) => `/api/images/${photoId}/${filename}`,
  ),
}));

vi.mock("../ExifPanel", () => ({
  ExifPanel: vi.fn(() => null),
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

import { PhotoLightbox } from "../PhotoLightbox";

interface TestElement {
  type: unknown;
  props: Record<string, unknown>;
}

function getLightboxElement(
  props: Parameters<typeof PhotoLightbox>[0],
): TestElement {
  const result = PhotoLightbox(props) as unknown as TestElement;
  const children = [result.props.children]
    .flat()
    .filter(Boolean) as TestElement[];
  const lightboxEl = children.find((c) => c.type === mockLightbox);
  if (!lightboxEl) throw new Error("Lightbox element not found in tree");
  return lightboxEl;
}

describe("PhotoLightbox", () => {
  const defaultProps = {
    photos: [
      {
        id: "photo-1",
        title: "Test Photo 1",
        description: "Description 1",
        originalFilename: "test1.jpg",
        width: 2400,
        height: 1600,
      },
      {
        id: "photo-2",
        title: null,
        description: null,
        originalFilename: "test2.jpg",
        width: 1200,
        height: 800,
      },
    ],
    index: 0,
    onClose: vi.fn(),
    onIndexChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("render.slide", () => {
    it("is provided as a function", () => {
      const lightbox = getLightboxElement(defaultProps);
      const render = lightbox.props.render as {
        slide: (...args: unknown[]) => unknown;
      };
      expect(render.slide).toBeTypeOf("function");
    });

    it("returns img element with protection attributes for image slides", () => {
      mockIsImageSlide.mockReturnValue(true);

      const lightbox = getLightboxElement(defaultProps);
      const renderSlide = (
        lightbox.props.render as { slide: (p: unknown) => unknown }
      ).slide;

      const testSlide = {
        src: "/api/images/photo-1/2400w.webp",
        alt: "Test Photo",
        srcSet: [
          { src: "/api/images/photo-1/300w.webp", width: 300 },
          { src: "/api/images/photo-1/600w.webp", width: 600 },
        ],
      };

      const slideEl = renderSlide({ slide: testSlide }) as TestElement;

      expect(slideEl).toBeDefined();
      expect(slideEl.type).toBe("img");
      expect(slideEl.props.draggable).toBe(false);
      expect(slideEl.props.className).toBe("yarl__slide_image");
      expect(slideEl.props.style).toEqual(
        expect.objectContaining({
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }),
      );
    });

    it("onContextMenu handler calls preventDefault", () => {
      mockIsImageSlide.mockReturnValue(true);

      const lightbox = getLightboxElement(defaultProps);
      const renderSlide = (
        lightbox.props.render as { slide: (p: unknown) => unknown }
      ).slide;
      const slideEl = renderSlide({
        slide: { src: "test.jpg" },
      }) as TestElement;

      const mockEvent = { preventDefault: vi.fn() };
      (slideEl.props.onContextMenu as (e: unknown) => void)(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalledOnce();
    });

    it("onDragStart handler calls preventDefault", () => {
      mockIsImageSlide.mockReturnValue(true);

      const lightbox = getLightboxElement(defaultProps);
      const renderSlide = (
        lightbox.props.render as { slide: (p: unknown) => unknown }
      ).slide;
      const slideEl = renderSlide({
        slide: { src: "test.jpg" },
      }) as TestElement;

      const mockEvent = { preventDefault: vi.fn() };
      (slideEl.props.onDragStart as (e: unknown) => void)(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalledOnce();
    });

    it("returns undefined for non-image slides", () => {
      mockIsImageSlide.mockReturnValue(false);

      const lightbox = getLightboxElement(defaultProps);
      const renderSlide = (
        lightbox.props.render as { slide: (p: unknown) => unknown }
      ).slide;
      const result = renderSlide({ slide: { type: "video", src: "vid.mp4" } });

      expect(result).toBeUndefined();
    });
  });

  describe("existing Lightbox props preserved", () => {
    it("passes plugins array with Zoom, Fullscreen, Captions", () => {
      const lightbox = getLightboxElement(defaultProps);
      const plugins = lightbox.props.plugins as unknown[];

      expect(plugins).toContain(mockZoom);
      expect(plugins).toContain(mockFullscreen);
      expect(plugins).toContain(mockCaptions);
    });

    it("passes zoom configuration", () => {
      const lightbox = getLightboxElement(defaultProps);

      expect(lightbox.props.zoom).toEqual(
        expect.objectContaining({
          maxZoomPixelRatio: 1,
          doubleClickMaxStops: 2,
        }),
      );
    });

    it("passes controller configuration with closeOnPullDown", () => {
      const lightbox = getLightboxElement(defaultProps);

      expect(lightbox.props.controller).toEqual(
        expect.objectContaining({
          closeOnPullDown: true,
          closeOnBackdropClick: false,
        }),
      );
    });
  });
});
