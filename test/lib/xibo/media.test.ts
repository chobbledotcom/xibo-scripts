/**
 * Tests for media library utilities
 */

import { describe, expect, test } from "#test-compat";
import {
  buildFolderTree,
  filterMedia,
  flattenFolderTree,
  folderBreadcrumbs,
  formatFileSize,
  isPreviewable,
  mediaTypeLabel,
} from "#xibo/media.ts";
import type { XiboFolder, XiboMedia } from "#xibo/types.ts";

describe("media utilities", () => {
  describe("formatFileSize", () => {
    test("formats bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    test("formats kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(10240)).toBe("10.0 KB");
    });

    test("formats megabytes", () => {
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(5242880)).toBe("5.0 MB");
    });

    test("formats gigabytes", () => {
      expect(formatFileSize(1073741824)).toBe("1.0 GB");
      expect(formatFileSize(2684354560)).toBe("2.5 GB");
    });
  });

  describe("mediaTypeLabel", () => {
    test("returns label for known types", () => {
      expect(mediaTypeLabel("image")).toBe("Image");
      expect(mediaTypeLabel("video")).toBe("Video");
      expect(mediaTypeLabel("font")).toBe("Font");
      expect(mediaTypeLabel("module")).toBe("Module");
      expect(mediaTypeLabel("genericfile")).toBe("File");
      expect(mediaTypeLabel("playersoftware")).toBe("Player Software");
    });

    test("returns raw type for unknown types", () => {
      expect(mediaTypeLabel("custom")).toBe("custom");
      expect(mediaTypeLabel("audio")).toBe("audio");
    });
  });

  describe("isPreviewable", () => {
    test("returns true for images", () => {
      expect(isPreviewable("image")).toBe(true);
    });

    test("returns false for non-images", () => {
      expect(isPreviewable("video")).toBe(false);
      expect(isPreviewable("font")).toBe(false);
      expect(isPreviewable("module")).toBe(false);
    });
  });

  describe("buildFolderTree", () => {
    test("returns empty array for empty input", () => {
      expect(buildFolderTree([])).toEqual([]);
    });

    test("returns root nodes for flat folders with no parents", () => {
      const result = buildFolderTree([
        { id: 1, text: "Root A", parentId: null },
        { id: 2, text: "Root B", parentId: null },
      ]);
      expect(result.length).toBe(2);
      expect(result[0]!.text).toBe("Root A");
      expect(result[1]!.text).toBe("Root B");
    });

    test("nests children under parents", () => {
      const result = buildFolderTree([
        { id: 1, text: "Root", parentId: null },
        { id: 2, text: "Child A", parentId: 1 },
        { id: 3, text: "Child B", parentId: 1 },
      ]);
      expect(result.length).toBe(1);
      expect(result[0]!.children.length).toBe(2);
      expect(result[0]!.children[0]!.text).toBe("Child A");
      expect(result[0]!.children[1]!.text).toBe("Child B");
    });

    test("handles deep nesting", () => {
      const result = buildFolderTree([
        { id: 1, text: "Root", parentId: null },
        { id: 2, text: "Child", parentId: 1 },
        { id: 3, text: "Grandchild", parentId: 2 },
      ]);
      expect(result[0]!.children[0]!.children[0]!.text).toBe("Grandchild");
    });

    test("treats orphaned children as roots", () => {
      const result = buildFolderTree([
        { id: 2, text: "Orphan", parentId: 999 },
      ]);
      expect(result.length).toBe(1);
      expect(result[0]!.text).toBe("Orphan");
    });
  });

  describe("flattenFolderTree", () => {
    test("returns empty array for empty input", () => {
      expect(flattenFolderTree([])).toEqual([]);
    });

    test("flattens with depth info", () => {
      const tree: XiboFolder[] = [
        {
          folderId: 1,
          text: "Root",
          parentId: null,
          children: [
            {
              folderId: 2,
              text: "Child",
              parentId: 1,
              children: [
                {
                  folderId: 3,
                  text: "Grandchild",
                  parentId: 2,
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      const result = flattenFolderTree(tree);
      expect(result.length).toBe(3);
      expect(result[0]).toEqual({ folderId: 1, text: "Root", depth: 0 });
      expect(result[1]).toEqual({ folderId: 2, text: "Child", depth: 1 });
      expect(result[2]).toEqual({
        folderId: 3,
        text: "Grandchild",
        depth: 2,
      });
    });

    test("handles multiple roots", () => {
      const tree: XiboFolder[] = [
        { folderId: 1, text: "A", parentId: null, children: [] },
        { folderId: 2, text: "B", parentId: null, children: [] },
      ];

      const result = flattenFolderTree(tree);
      expect(result.length).toBe(2);
      expect(result[0]!.depth).toBe(0);
      expect(result[1]!.depth).toBe(0);
    });
  });

  describe("folderBreadcrumbs", () => {
    const tree: XiboFolder[] = [
      {
        folderId: 1,
        text: "Root",
        parentId: null,
        children: [
          {
            folderId: 2,
            text: "Child",
            parentId: 1,
            children: [
              {
                folderId: 3,
                text: "Grandchild",
                parentId: 2,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    test("returns path to target folder", () => {
      const result = folderBreadcrumbs(tree, 3);
      expect(result.length).toBe(3);
      expect(result[0]!.text).toBe("Root");
      expect(result[1]!.text).toBe("Child");
      expect(result[2]!.text).toBe("Grandchild");
    });

    test("returns single-element path for root", () => {
      const result = folderBreadcrumbs(tree, 1);
      expect(result.length).toBe(1);
      expect(result[0]!.text).toBe("Root");
    });

    test("returns empty array for non-existent folder", () => {
      const result = folderBreadcrumbs(tree, 999);
      expect(result.length).toBe(0);
    });

    test("returns empty array for empty tree", () => {
      const result = folderBreadcrumbs([], 1);
      expect(result.length).toBe(0);
    });
  });

  describe("filterMedia", () => {
    const media: XiboMedia[] = [
      {
        mediaId: 1,
        name: "photo.jpg",
        mediaType: "image",
        storedAs: "1.jpg",
        fileSize: 1024,
        duration: 10,
        tags: "",
        folderId: 1,
      },
      {
        mediaId: 2,
        name: "clip.mp4",
        mediaType: "video",
        storedAs: "2.mp4",
        fileSize: 2048,
        duration: 30,
        tags: "",
        folderId: 1,
      },
      {
        mediaId: 3,
        name: "banner.png",
        mediaType: "image",
        storedAs: "3.png",
        fileSize: 512,
        duration: 10,
        tags: "",
        folderId: 2,
      },
    ];

    test("returns all media with no filters", () => {
      expect(filterMedia(media).length).toBe(3);
    });

    test("filters by folderId", () => {
      const result = filterMedia(media, 1);
      expect(result.length).toBe(2);
      expect(result[0]!.name).toBe("photo.jpg");
      expect(result[1]!.name).toBe("clip.mp4");
    });

    test("filters by media type", () => {
      const result = filterMedia(media, undefined, "image");
      expect(result.length).toBe(2);
      expect(result[0]!.name).toBe("photo.jpg");
      expect(result[1]!.name).toBe("banner.png");
    });

    test("filters by both folderId and type", () => {
      const result = filterMedia(media, 1, "image");
      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe("photo.jpg");
    });

    test("returns empty array when no matches", () => {
      const result = filterMedia(media, 999);
      expect(result.length).toBe(0);
    });
  });
});
