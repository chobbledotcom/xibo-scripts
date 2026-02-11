/**
 * Xibo CMS API type definitions
 */

/** OAuth2 access token response */
export type XiboAuthToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

/** Xibo API error response */
export type XiboApiError = {
  httpStatus: number;
  message: string;
};

/** Menu board */
export type XiboMenuBoard = {
  menuId: number;
  name: string;
  code: string;
  description: string;
  modifiedDt: number | null;
};

/** Menu board category */
export type XiboCategory = {
  menuCategoryId: number;
  menuId: number;
  name: string;
  code: string;
  mediaId: number | null;
};

/** Menu board product */
export type XiboProduct = {
  menuProductId: number;
  menuCategoryId: number;
  name: string;
  price: string;
  calories: string;
  allergyInfo: string;
  availability: number;
  description: string;
  mediaId: number | null;
};

/** Media library item */
export type XiboMedia = {
  mediaId: number;
  name: string;
  mediaType: string;
  storedAs: string;
  fileSize: number;
  duration: number;
  tags: string;
  folderId: number;
};

/** Folder in media library */
export type XiboFolder = {
  folderId: number;
  text: string;
  parentId: number | null;
  children: XiboFolder[];
};

/** Layout */
export type XiboLayout = {
  layoutId: number;
  layout: string;
  description: string;
  status: number;
  width: number;
  height: number;
  publishedStatusId: number;
};

/** Region within a layout */
export type XiboRegion = {
  regionId: number;
  width: number;
  height: number;
  top: number;
  left: number;
  zIndex: number;
};

/** Widget within a region */
export type XiboWidget = {
  widgetId: number;
  type: string;
  displayOrder: number;
};

/** Dataset column definition */
export type XiboDatasetColumn = {
  dataSetColumnId: number;
  heading: string;
  dataTypeId: number;
  dataSetColumnTypeId: number;
  listContent: string;
  columnOrder: number;
};

/** Dataset */
export type XiboDataset = {
  dataSetId: number;
  dataSet: string;
  description: string;
  code: string;
  columnCount: number;
  columns: XiboDatasetColumn[];
};

/** Dataset row data — keyed by column heading */
export type XiboDatasetRow = Record<string, string | number | null>;

/** Display resolution */
export type XiboResolution = {
  resolutionId: number;
  resolution: string;
  width: number;
  height: number;
};

/** Xibo API client configuration */
export type XiboConfig = {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
};

/** Result of a connection test */
export type ConnectionTestResult = {
  success: boolean;
  message: string;
  version?: string;
};

/** Xibo CMS about/version info */
export type XiboAbout = {
  version: string;
  sourceUrl?: string;
};

/** Dashboard status summary */
export type DashboardStatus = {
  connected: boolean;
  version: string | null;
  menuBoardCount: number | null;
  mediaCount: number | null;
  layoutCount: number | null;
  datasetCount: number | null;
};
