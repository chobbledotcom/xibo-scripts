/**
 * Media library page templates
 */

import type { AdminSession } from "#lib/types.ts";
import type { XiboFolder, XiboMedia } from "#xibo/types.ts";
import {
  filterMedia,
  flattenFolderTree,
  formatFileSize,
  isPreviewable,
  mediaTypeLabel,
} from "#xibo/media.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/**
 * Media list page — browse media with folder/type filtering
 */
export const mediaListPage = (
  session: AdminSession,
  allMedia: XiboMedia[],
  folders: XiboFolder[],
  folderId?: number,
  mediaType?: string,
  success?: string,
  error?: string,
): string => {
  const media = filterMedia(allMedia, folderId, mediaType);
  const flatFolders = flattenFolderTree(folders);

  return String(
    <Layout title="Media Library">
      <AdminNav session={session} />
      <h2>Media Library</h2>

      {success && <div class="success">{success}</div>}
      {error && <div class="error">{error}</div>}

      <section>
        <div>
          <a href="/admin/media/upload">
            <button type="button">Upload Media</button>
          </a>
        </div>

        <details open>
          <summary>Filters</summary>
          <form method="GET" action="/admin/media">
            <label>
              Folder
              <select name="folderId">
                <option value="">All folders</option>
                {flatFolders.map((f) => (
                  <option
                    value={String(f.folderId)}
                    selected={f.folderId === folderId}
                  >
                    {"—".repeat(f.depth)} {f.text}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select name="type">
                <option value="">All types</option>
                <option value="image" selected={mediaType === "image"}>
                  Image
                </option>
                <option value="video" selected={mediaType === "video"}>
                  Video
                </option>
                <option value="font" selected={mediaType === "font"}>
                  Font
                </option>
                <option value="module" selected={mediaType === "module"}>
                  Module
                </option>
              </select>
            </label>
            <button type="submit">Filter</button>
          </form>
        </details>
      </section>

      <section>
        {media.length === 0
          ? <p>No media found.</p>
          : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {media.map((m) => (
                  <tr>
                    <td>
                      <a href={`/admin/media/${m.mediaId}`}>{m.name}</a>
                    </td>
                    <td>{mediaTypeLabel(m.mediaType)}</td>
                    <td>{formatFileSize(m.fileSize)}</td>
                    <td>
                      <a href={`/admin/media/${m.mediaId}`}>View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        <p>{media.length} item{media.length !== 1 ? "s" : ""}</p>
      </section>
    </Layout>,
  );
};

/**
 * Media upload form page
 */
export const mediaUploadPage = (
  session: AdminSession,
  folders: XiboFolder[],
  error?: string,
): string => {
  const flatFolders = flattenFolderTree(folders);

  return String(
    <Layout title="Upload Media">
      <AdminNav session={session} />
      <Breadcrumb href="/admin/media" label="Media Library" />
      <h2>Upload Media</h2>

      {error && <div class="error">{error}</div>}

      <section>
        <h3>Upload File</h3>
        <form
          method="POST"
          action="/admin/media/upload"
          enctype="multipart/form-data"
        >
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <label>
            File
            <input type="file" name="file" required />
          </label>
          <label>
            Name (optional, defaults to filename)
            <input type="text" name="name" placeholder="Media name" />
          </label>
          <label>
            Folder
            <select name="folderId">
              <option value="">Root</option>
              {flatFolders.map((f) => (
                <option value={String(f.folderId)}>
                  {"—".repeat(f.depth)} {f.text}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Upload</button>
        </form>
      </section>

      <section>
        <h3>Upload from URL</h3>
        <form method="POST" action="/admin/media/upload-url">
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <label>
            URL
            <input
              type="url"
              name="url"
              required
              placeholder="https://example.com/image.jpg"
            />
          </label>
          <label>
            Name
            <input type="text" name="name" required placeholder="Media name" />
          </label>
          <label>
            Folder
            <select name="folderId">
              <option value="">Root</option>
              {flatFolders.map((f) => (
                <option value={String(f.folderId)}>
                  {"—".repeat(f.depth)} {f.text}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Upload from URL</button>
        </form>
      </section>
    </Layout>,
  );
};

/**
 * Media detail / view page
 */
export const mediaDetailPage = (
  session: AdminSession,
  media: XiboMedia,
): string =>
  String(
    <Layout title={media.name}>
      <AdminNav session={session} />
      <Breadcrumb href="/admin/media" label="Media Library" />
      <h2>{media.name}</h2>

      {isPreviewable(media.mediaType) && (
        <section>
          <img
            src={`/admin/media/${media.mediaId}/preview`}
            alt={media.name}
            style="max-width:100%;max-height:400px"
          />
        </section>
      )}

      <section>
        <table>
          <tbody>
            <tr>
              <th>ID</th>
              <td>{media.mediaId}</td>
            </tr>
            <tr>
              <th>Name</th>
              <td>{media.name}</td>
            </tr>
            <tr>
              <th>Type</th>
              <td>{mediaTypeLabel(media.mediaType)}</td>
            </tr>
            <tr>
              <th>Size</th>
              <td>{formatFileSize(media.fileSize)}</td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>{media.duration}s</td>
            </tr>
            <tr>
              <th>Stored As</th>
              <td>{media.storedAs}</td>
            </tr>
            <tr>
              <th>Tags</th>
              <td>{media.tags || "—"}</td>
            </tr>
            <tr>
              <th>Folder ID</th>
              <td>{media.folderId}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <form method="POST" action={`/admin/media/${media.mediaId}/delete`}>
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <button type="submit" class="error">Delete Media</button>
        </form>
      </section>
    </Layout>,
  );
