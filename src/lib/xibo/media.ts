/**
 * Media library utilities — file size formatting, media type helpers,
 * and folder tree construction.
 */

import { filter, identity, pipe, reduce } from "#fp";
import type { XiboFolder, XiboMedia } from "#xibo/types.ts";

/**
 * Format a byte count into a human-readable string (KB, MB, GB).
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

/** Known Xibo media types and their display labels */
const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  font: "Font",
  module: "Module",
  genericfile: "File",
  playersoftware: "Player Software",
};

/**
 * Get a human-readable label for a Xibo media type.
 */
export const mediaTypeLabel = (mediaType: string): string =>
  MEDIA_TYPE_LABELS[mediaType] ?? mediaType;

/**
 * Return true if the media type is previewable (images).
 */
export const isPreviewable = (mediaType: string): boolean =>
  mediaType === "image";

/** Flat folder as returned by the Xibo API */
type FlatFolder = {
  id: number;
  text: string;
  parentId: number | null;
};

/**
 * Build a tree of XiboFolder nodes from a flat array.
 * The Xibo `/api/folders` endpoint can return either a flat list (with parentId)
 * or a pre-built tree (with children). This handles the flat case.
 */
export const buildFolderTree = (folders: FlatFolder[]): XiboFolder[] => {
  const nodeMap = pipe(
    reduce((acc: Map<number, XiboFolder>, f: FlatFolder) => {
      acc.set(f.id, {
        folderId: f.id,
        text: f.text,
        parentId: f.parentId,
        children: [],
      });
      return acc;
    }, new Map<number, XiboFolder>()),
  )(folders);

  const roots: XiboFolder[] = [];

  for (const folder of nodeMap.values()) {
    if (folder.parentId === null || !nodeMap.has(folder.parentId)) {
      roots.push(folder);
    } else {
      nodeMap.get(folder.parentId)!.children.push(folder);
    }
  }

  return roots;
};

/**
 * Flatten a folder tree into a list with depth information (for select dropdowns).
 */
export const flattenFolderTree = (
  folders: XiboFolder[],
  depth = 0,
): { folderId: number; text: string; depth: number }[] =>
  reduce(
    (
      acc: { folderId: number; text: string; depth: number }[],
      folder: XiboFolder,
    ) => {
      acc.push({ folderId: folder.folderId, text: folder.text, depth });
      for (const child of flattenFolderTree(folder.children, depth + 1)) {
        acc.push(child);
      }
      return acc;
    },
    [] as { folderId: number; text: string; depth: number }[],
  )(folders);

/**
 * Find a folder's breadcrumb path (from root to the target folder).
 */
export const folderBreadcrumbs = (
  folders: XiboFolder[],
  targetId: number,
): XiboFolder[] => {
  const find = (
    nodes: XiboFolder[],
    path: XiboFolder[],
  ): XiboFolder[] | null => {
    for (const node of nodes) {
      const current = [...path, node];
      if (node.folderId === targetId) return current;
      const found = find(node.children, current);
      if (found) return found;
    }
    return null;
  };

  return find(folders, []) ?? [];
};

/**
 * Filter media list by optional folder and type criteria.
 */
export const filterMedia = (
  media: XiboMedia[],
  folderId?: number,
  mediaType?: string,
): XiboMedia[] =>
  pipe(
    folderId !== undefined
      ? filter((m: XiboMedia) => m.folderId === folderId)
      : identity<XiboMedia[]>,
    mediaType
      ? filter((m: XiboMedia) => m.mediaType === mediaType)
      : identity<XiboMedia[]>,
  )(media);
