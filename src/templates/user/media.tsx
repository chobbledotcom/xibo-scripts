/**
 * User-facing media page templates
 *
 * Shows shared photos (read-only) and business-owned photos (editable).
 */

import type { AdminSession } from "#lib/types.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import type { XiboMedia } from "#xibo/types.ts";
import { formatFileSize, isPreviewable } from "#xibo/media.ts";
import { Layout } from "#templates/layout.tsx";
import { UserBreadcrumb, UserNav } from "#templates/user/nav.tsx";

/** Media table row with preview, name, size, and optional actions */
const MediaRow = (
  { media, previewBase, canDelete, csrfToken, deleteBase }: {
    media: XiboMedia;
    previewBase: string;
    canDelete: boolean;
    csrfToken: string;
    deleteBase: string;
  },
): JSX.Element => (
  <tr>
    <td>
      {isPreviewable(media.mediaType) && (
        <img
          src={`${previewBase}/${media.mediaId}/preview`}
          alt={media.name}
          style="max-width:80px;max-height:60px"
        />
      )}
    </td>
    <td>{media.name}</td>
    <td>{formatFileSize(media.fileSize)}</td>
    <td>
      {canDelete && (
        <form
          method="POST"
          action={`${deleteBase}/${media.mediaId}/delete`}
          style="display:inline"
        >
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <button type="submit" class="error">Delete</button>
        </form>
      )}
    </td>
  </tr>
);

/** Media table with header and rows */
const MediaTable = (
  { media, previewBase, canDelete, csrfToken, deleteBase }: {
    media: XiboMedia[];
    previewBase: string;
    canDelete: boolean;
    csrfToken: string;
    deleteBase: string;
  },
): JSX.Element => (
  <table>
    <thead>
      <tr>
        <th>Preview</th>
        <th>Name</th>
        <th>Size</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {media.map((m) => (
        <MediaRow
          media={m}
          previewBase={previewBase}
          canDelete={canDelete}
          csrfToken={csrfToken}
          deleteBase={deleteBase}
        />
      ))}
    </tbody>
  </table>
);

/**
 * User media browse page — shows shared photos (read-only) and business photos (editable)
 */
export const userMediaPage = (
  session: AdminSession,
  activeBusiness: DisplayBusiness,
  allBusinesses: DisplayBusiness[],
  sharedMedia: XiboMedia[],
  businessMedia: XiboMedia[],
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title="My Media">
      <UserNav
        session={session}
        activeBusiness={activeBusiness}
        allBusinesses={allBusinesses}
      />
      <h2>Media - {activeBusiness.name}</h2>

      {success && <div class="success">{success}</div>}
      {error && <div class="error">{error}</div>}

      <section>
        <div>
          <a href="/dashboard/media/upload">
            <button type="button">Upload Photo</button>
          </a>
        </div>
      </section>

      <section>
        <h3>My Photos ({businessMedia.length})</h3>
        {businessMedia.length === 0
          ? <p>No photos uploaded yet.</p>
          : (
            <MediaTable
              media={businessMedia}
              previewBase="/dashboard/media"
              canDelete
              csrfToken={session.csrfToken}
              deleteBase="/dashboard/media"
            />
          )}
      </section>

      <section>
        <h3>Shared Photos ({sharedMedia.length})</h3>
        {sharedMedia.length === 0
          ? <p>No shared photos available.</p>
          : (
            <MediaTable
              media={sharedMedia}
              previewBase="/dashboard/media"
              canDelete={false}
              csrfToken={session.csrfToken}
              deleteBase="/dashboard/media"
            />
          )}
      </section>
    </Layout>,
  );

/**
 * User media upload form page
 */
export const userMediaUploadPage = (
  session: AdminSession,
  activeBusiness: DisplayBusiness,
  allBusinesses: DisplayBusiness[],
  error?: string,
): string =>
  String(
    <Layout title="Upload Photo">
      <UserNav
        session={session}
        activeBusiness={activeBusiness}
        allBusinesses={allBusinesses}
      />
      <UserBreadcrumb href="/dashboard/media" label="My Media" />
      <h2>Upload Photo - {activeBusiness.name}</h2>

      {error && <div class="error">{error}</div>}

      <section>
        <form
          method="POST"
          action="/dashboard/media/upload"
          enctype="multipart/form-data"
        >
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <label>
            File
            <input type="file" name="file" accept="image/*" required />
          </label>
          <label>
            Name (optional, defaults to filename)
            <input type="text" name="name" placeholder="Photo name" />
          </label>
          <button type="submit">Upload</button>
        </form>
      </section>
    </Layout>,
  );
