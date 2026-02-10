# Part 4: Media Library Management

**Goal**: Browse, upload, and manage media files in the Xibo CMS from the web UI.

**Depends on**: Part 2 (Xibo API client)

**Can be worked in parallel with**: Part 3 (Menu Boards)

---

## 4.1 Media Routes (`src/routes/admin/media.ts`)

- `GET /admin/media` - List all media with folder hierarchy
  - Query params: `folderId` (filter by folder), `type` (filter by media type)
  - Display: name, type, file size, dimensions, folder, actions
- `GET /admin/media/upload` - Upload form
- `POST /admin/media/upload` - Upload media file
  - Accept multipart form data (file + name + folderId)
  - Forward to Xibo API as multipart upload
  - Show success with media details
- `POST /admin/media/upload-url` - Upload media from URL
  - Fields: URL, name, folderId
  - Download image from URL, then upload to Xibo
  - Handle filename conflicts
- `GET /admin/media/:id` - View media details
  - Show: name, type, size, dimensions, tags, folder, created/modified dates
  - Preview image (if image type) via Xibo library download endpoint
- `POST /admin/media/:id/delete` - Delete media with confirmation

## 4.2 Media Templates (`src/templates/admin/media.tsx`)

- **Media list page**:
  - Folder sidebar/breadcrumbs showing hierarchy
  - Media table: name, type icon, size (human-readable), folder, actions
  - Filter controls: by folder, by type (image, video, font, etc.)
  - "Upload" button
- **Upload form**:
  - File input (drag-and-drop area if possible with JS)
  - Name field (auto-populated from filename)
  - Folder selection dropdown
  - Submit button
- **Upload from URL form**:
  - URL input
  - Name field
  - Folder selection
- **Media detail page**:
  - All metadata
  - Image preview (for image types)
  - Delete button with confirmation

## 4.3 Xibo API Integration

Media API calls:

- `GET /api/library` -> list media (params: folderId, type)
- `POST /api/library` -> upload media (multipart: files, name, folderId)
- `GET /api/library/download/:id` -> download/preview media
- `DELETE /api/library/{id}` -> delete media
- `GET /api/folders` -> list folder structure

Utilities:
- File size formatting utility (bytes -> KB/MB/GB)
- Media type icons/labels (image, video, font, module, etc.)

## 4.4 Folder Display

- Build folder tree from flat API response (parentId -> children)
- Breadcrumb navigation within folders
- Folder filtering on media list

## 4.5 Tests

- Route tests:
  - List media (empty, with data, filtered by folder/type)
  - Upload file (success, validation errors, API errors)
  - Upload from URL (success, download failure, upload failure)
  - Delete media (confirmation, success)
  - View media details
- Folder tree building tests
- File size formatting tests

## Expected Outcome

Can browse media in folders, upload files (from disk or URL), view media details with preview, and delete media. All operations go through the Xibo API.
