/**
 * Tests for media page templates
 */

import { describe, expect, test } from "#test-compat";
import {
  mediaDetailPage,
  mediaListPage,
  mediaUploadPage,
} from "#templates/admin/media.tsx";
import type { AdminSession } from "#lib/types.ts";
import type { XiboFolder, XiboMedia } from "#xibo/types.ts";

const session: AdminSession = {
  csrfToken: "test-csrf-token",
  adminLevel: "owner",
};

const sampleMedia: XiboMedia[] = [
  {
    mediaId: 1,
    name: "photo.jpg",
    mediaType: "image",
    storedAs: "1.jpg",
    fileSize: 1048576,
    duration: 10,
    tags: "hero,banner",
    folderId: 1,
  },
  {
    mediaId: 2,
    name: "clip.mp4",
    mediaType: "video",
    storedAs: "2.mp4",
    fileSize: 5242880,
    duration: 30,
    tags: "",
    folderId: 2,
  },
];

const sampleFolders: XiboFolder[] = [
  {
    folderId: 1,
    text: "Images",
    parentId: null,
    children: [
      {
        folderId: 3,
        text: "Banners",
        parentId: 1,
        children: [],
      },
    ],
  },
  {
    folderId: 2,
    text: "Videos",
    parentId: null,
    children: [],
  },
];

describe("media templates", () => {
  describe("mediaListPage", () => {
    test("renders page title", () => {
      const html = mediaListPage(session, [], [], undefined, undefined);
      expect(html).toContain("Media Library");
    });

    test("renders upload button", () => {
      const html = mediaListPage(session, [], [], undefined, undefined);
      expect(html).toContain("/admin/media/upload");
      expect(html).toContain("Upload Media");
    });

    test("shows empty message when no media", () => {
      const html = mediaListPage(session, [], [], undefined, undefined);
      expect(html).toContain("No media found");
    });

    test("renders media table with items", () => {
      const html = mediaListPage(
        session,
        sampleMedia,
        sampleFolders,
        undefined,
        undefined,
      );
      expect(html).toContain("photo.jpg");
      expect(html).toContain("clip.mp4");
      expect(html).toContain("Image");
      expect(html).toContain("Video");
      expect(html).toContain("1.0 MB");
      expect(html).toContain("5.0 MB");
    });

    test("renders links to media details", () => {
      const html = mediaListPage(
        session,
        sampleMedia,
        sampleFolders,
        undefined,
        undefined,
      );
      expect(html).toContain("/admin/media/1");
      expect(html).toContain("/admin/media/2");
    });

    test("renders folder filter options", () => {
      const html = mediaListPage(
        session,
        sampleMedia,
        sampleFolders,
        undefined,
        undefined,
      );
      expect(html).toContain("Images");
      expect(html).toContain("Videos");
      expect(html).toContain("Banners");
    });

    test("shows success message", () => {
      const html = mediaListPage(
        session,
        [],
        [],
        undefined,
        undefined,
        "File uploaded",
      );
      expect(html).toContain("File uploaded");
      expect(html).toContain("success");
    });

    test("shows error message", () => {
      const html = mediaListPage(
        session,
        [],
        [],
        undefined,
        undefined,
        undefined,
        "API error",
      );
      expect(html).toContain("API error");
      expect(html).toContain("error");
    });

    test("filters media by folderId", () => {
      const html = mediaListPage(
        session,
        sampleMedia,
        sampleFolders,
        1,
        undefined,
      );
      expect(html).toContain("photo.jpg");
      expect(html).not.toContain("clip.mp4");
    });

    test("filters media by type", () => {
      const html = mediaListPage(
        session,
        sampleMedia,
        sampleFolders,
        undefined,
        "video",
      );
      expect(html).toContain("clip.mp4");
      expect(html).not.toContain("photo.jpg");
    });

    test("shows item count", () => {
      const html = mediaListPage(
        session,
        sampleMedia,
        sampleFolders,
        undefined,
        undefined,
      );
      expect(html).toContain("2 items");
    });

    test("shows singular item count", () => {
      const html = mediaListPage(
        session,
        [sampleMedia[0]!],
        sampleFolders,
        undefined,
        undefined,
      );
      expect(html).toContain("1 item");
      expect(html).not.toContain("1 items");
    });
  });

  describe("mediaUploadPage", () => {
    test("renders page title", () => {
      const html = mediaUploadPage(session, []);
      expect(html).toContain("Upload Media");
    });

    test("renders breadcrumb back to media list", () => {
      const html = mediaUploadPage(session, []);
      expect(html).toContain("/admin/media");
      expect(html).toContain("Media Library");
    });

    test("renders file upload form", () => {
      const html = mediaUploadPage(session, []);
      expect(html).toContain('enctype="multipart/form-data"');
      expect(html).toContain('type="file"');
      expect(html).toContain('name="file"');
    });

    test("includes CSRF token in both forms", () => {
      const html = mediaUploadPage(session, []);
      expect(html).toContain("test-csrf-token");
    });

    test("renders URL upload form", () => {
      const html = mediaUploadPage(session, []);
      expect(html).toContain("/admin/media/upload-url");
      expect(html).toContain('type="url"');
    });

    test("renders folder select options", () => {
      const html = mediaUploadPage(session, sampleFolders);
      expect(html).toContain("Images");
      expect(html).toContain("Videos");
    });

    test("shows error message", () => {
      const html = mediaUploadPage(session, [], "Upload failed");
      expect(html).toContain("Upload failed");
      expect(html).toContain("error");
    });
  });

  describe("mediaDetailPage", () => {
    const media = sampleMedia[0]!;

    test("renders media name as heading", () => {
      const html = mediaDetailPage(session, media);
      expect(html).toContain("photo.jpg");
    });

    test("renders breadcrumb back to media list", () => {
      const html = mediaDetailPage(session, media);
      expect(html).toContain("/admin/media");
      expect(html).toContain("Media Library");
    });

    test("shows media metadata", () => {
      const html = mediaDetailPage(session, media);
      expect(html).toContain("Image");
      expect(html).toContain("1.0 MB");
      expect(html).toContain("10s");
      expect(html).toContain("1.jpg");
      expect(html).toContain("hero,banner");
    });

    test("shows image preview for image type", () => {
      const html = mediaDetailPage(session, media);
      expect(html).toContain("/admin/media/1/preview");
      expect(html).toContain("<img");
    });

    test("does not show image preview for non-image type", () => {
      const videoMedia = sampleMedia[1]!;
      const html = mediaDetailPage(session, videoMedia);
      expect(html).not.toContain("<img");
    });

    test("renders delete form with CSRF", () => {
      const html = mediaDetailPage(session, media);
      expect(html).toContain("/admin/media/1/delete");
      expect(html).toContain("test-csrf-token");
      expect(html).toContain("Delete Media");
    });
  });
});
