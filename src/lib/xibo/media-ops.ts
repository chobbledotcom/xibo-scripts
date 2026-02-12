/**
 * Pure Xibo media operations.
 *
 * Data-fetching and parsing helpers with no HTTP-layer dependencies.
 * HTTP-aware handlers (upload, delete, preview) live in routes/media-ops.ts.
 */

import { del, get, getRaw, postMultipart } from "#xibo/client.ts";
import type { XiboConfig, XiboFolder, XiboMedia } from "#xibo/types.ts";

/**
 * Fetch the folder list from Xibo. Returns empty array on error.
 */
export const fetchFolders = async (
  config: XiboConfig,
): Promise<XiboFolder[]> => {
  try {
    return await get<XiboFolder[]>(config, "folders");
  } catch {
    return [];
  }
};

/**
 * Fetch all media from Xibo.
 */
export const fetchAllMedia = (config: XiboConfig): Promise<XiboMedia[]> =>
  get<XiboMedia[]>(config, "library");

/**
 * Find a specific media item by ID. Returns undefined if not found.
 */
export const findMediaById = async (
  config: XiboConfig,
  mediaId: number,
): Promise<XiboMedia | undefined> => {
  const allMedia = await fetchAllMedia(config);
  return allMedia.find((m) => m.mediaId === mediaId);
};

/**
 * Extract file from validated FormData. Returns null if no valid file.
 */
export const extractFile = (
  formData: FormData,
): File | null => {
  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) return null;
  return file;
};

/**
 * Extract the upload name from form data, falling back to the file name.
 */
export const extractUploadName = (formData: FormData, file: File): string =>
  (formData.get("name") as string) || file.name;

/**
 * Build upload FormData and send to Xibo.
 * Returns the API result on success, throws on failure.
 */
export const uploadMedia = (
  config: XiboConfig,
  file: File,
  name: string,
  folderId: string,
): Promise<XiboMedia> => {
  const uploadData = new FormData();
  uploadData.append("files", file, file.name);
  uploadData.append("name", name);
  if (folderId) uploadData.append("folderId", folderId);
  return postMultipart<XiboMedia>(config, "library", uploadData);
};

/**
 * Delete a media item by ID.
 */
export const deleteMedia = (
  config: XiboConfig,
  mediaId: number,
): Promise<void> => del(config, `library/${mediaId}`);

/**
 * Fetch raw media content for preview/download.
 */
export const fetchMediaRaw = (
  config: XiboConfig,
  mediaId: string,
): Promise<Response> => getRaw(config, `library/download/${mediaId}`);
