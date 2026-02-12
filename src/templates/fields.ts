/**
 * Form field definitions for all forms
 */

import type { Field } from "#lib/forms.tsx";
import type { AdminLevel } from "#lib/types.ts";

/** Typed values from login form */
export type LoginFormValues = {
  username: string;
  password: string;
};

/** Typed values from setup form */
export type SetupFormValues = {
  admin_username: string;
  admin_password: string;
  admin_password_confirm: string;
  xibo_api_url: string | null;
  xibo_client_id: string | null;
  xibo_client_secret: string | null;
};

/** Typed values from change password form */
export type ChangePasswordFormValues = {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
};

/** Typed values from invite user form */
export type InviteUserFormValues = {
  username: string;
  admin_level: AdminLevel;
};

/** Typed values from join (set password) form */
export type JoinFormValues = {
  password: string;
  password_confirm: string;
};

/** Typed values from Xibo credentials form */
export type XiboCredentialsFormValues = {
  xibo_api_url: string;
  xibo_client_id: string;
  xibo_client_secret: string;
};

/** Typed values from menu board form */
export type MenuBoardFormValues = {
  name: string;
  code: string | null;
  description: string | null;
};

/** Typed values from menu board category form */
export type CategoryFormValues = {
  name: string;
  code: string | null;
  media_id: number | null;
};

/** Typed values from menu board product form */
export type ProductFormValues = {
  name: string;
  description: string | null;
  price: string;
  calories: string | null;
  allergy_info: string | null;
  availability: number | null;
  media_id: number | null;
};

/** Validate username format: alphanumeric, hyphens, underscores, 2-32 chars */
export const validateUsername = (value: string): string | null => {
  if (value.length < 2) return "Username must be at least 2 characters";
  if (value.length > 32) return "Username must be 32 characters or fewer";
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return "Username may only contain letters, numbers, hyphens, and underscores";
  }
  return null;
};

/**
 * Login form field definitions
 */
export const loginFields: Field[] = [
  { name: "username", label: "Username", type: "text", required: true },
  { name: "password", label: "Password", type: "password", required: true },
];

/**
 * Setup form field definitions for Xibo Scripts
 */
export const setupFields: Field[] = [
  {
    name: "admin_username",
    label: "Admin Username *",
    type: "text",
    required: true,
    hint: "Letters, numbers, hyphens, underscores (2-32 chars)",
    validate: validateUsername,
  },
  {
    name: "admin_password",
    label: "Admin Password *",
    type: "password",
    required: true,
    hint: "Minimum 8 characters",
  },
  {
    name: "admin_password_confirm",
    label: "Confirm Admin Password *",
    type: "password",
    required: true,
  },
  {
    name: "xibo_api_url",
    label: "Xibo CMS URL",
    type: "url",
    placeholder: "https://your-xibo-cms.example.com",
    hint: "The base URL of your Xibo CMS instance",
  },
  {
    name: "xibo_client_id",
    label: "Xibo Client ID",
    type: "text",
    placeholder: "Your OAuth2 client ID",
    hint: "OAuth2 client credentials from your Xibo CMS",
  },
  {
    name: "xibo_client_secret",
    label: "Xibo Client Secret",
    type: "password",
    placeholder: "Your OAuth2 client secret",
    hint: "Keep this secret - stored encrypted in the database",
  },
];

/**
 * Change password form field definitions
 */
export const changePasswordFields: Field[] = [
  {
    name: "current_password",
    label: "Current Password",
    type: "password",
    required: true,
  },
  {
    name: "new_password",
    label: "New Password",
    type: "password",
    required: true,
    hint: "Minimum 8 characters",
  },
  {
    name: "new_password_confirm",
    label: "Confirm New Password",
    type: "password",
    required: true,
  },
];

/**
 * Xibo API credentials form (for settings page)
 */
export const xiboCredentialsFields: Field[] = [
  {
    name: "xibo_api_url",
    label: "Xibo CMS URL",
    type: "url",
    required: true,
    placeholder: "https://your-xibo-cms.example.com",
  },
  {
    name: "xibo_client_id",
    label: "Client ID",
    type: "text",
    required: true,
    placeholder: "OAuth2 client ID",
  },
  {
    name: "xibo_client_secret",
    label: "Client Secret",
    type: "password",
    required: true,
    placeholder: "OAuth2 client secret",
  },
];

/** All role options for the invite form */
const ALL_ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
] as const;

/** Role options visible to a manager (user only) */
const MANAGER_ROLE_OPTIONS = [
  { value: "user", label: "User" },
] as const;

/** Username field shared by invite form */
const inviteUsernameField: Field = {
  name: "username",
  label: "Username",
  type: "text",
  required: true,
  hint: "Letters, numbers, hyphens, underscores (2-32 chars)",
  validate: validateUsername,
};

/**
 * Invite user form field definitions — filtered by the actor's role.
 * Managers see only "User" option; owners see all roles.
 */
export const inviteUserFields = (actorRole: AdminLevel): Field[] => [
  inviteUsernameField,
  {
    name: "admin_level",
    label: "Role",
    type: "select",
    required: true,
    options: actorRole === "owner"
      ? [...ALL_ROLE_OPTIONS]
      : [...MANAGER_ROLE_OPTIONS],
  },
];

/**
 * Join (set password) form field definitions
 */
export const joinFields: Field[] = [
  {
    name: "password",
    label: "Password",
    type: "password",
    required: true,
    hint: "Minimum 8 characters",
  },
  {
    name: "password_confirm",
    label: "Confirm Password",
    type: "password",
    required: true,
  },
];

/** Common field: name (required text) */
const nameField: Field = { name: "name", label: "Name", type: "text", required: true };

/** Common field: code (optional text) */
const codeField: Field = { name: "code", label: "Code", type: "text" };

/** Common field: description (optional textarea) */
const descriptionField: Field = { name: "description", label: "Description", type: "textarea" };

/** Common field: media_id (optional number) */
const mediaIdField: Field = { name: "media_id", label: "Media", type: "number", hint: "Media library ID" };

const priceField: Field = { name: "price", label: "Price", type: "text", required: true, hint: "e.g. 9.99" };

/** Typed values from business form */
export type BusinessFormValues = {
  name: string;
};

/** Typed values from screen form */
export type ScreenFormValues = {
  name: string;
  xibo_display_id: number | null;
};

/**
 * Business form field definitions
 */
export const businessFields: Field[] = [
  nameField,
];

/**
 * Screen form field definitions
 */
export const screenFields: Field[] = [
  nameField,
];

/**
 * Menu board form field definitions
 */
export const menuBoardFields: Field[] = [
  nameField,
  codeField,
  descriptionField,
];

/**
 * Menu board category form field definitions
 */
export const categoryFields: Field[] = [
  nameField,
  codeField,
  mediaIdField,
];

/**
 * Menu board product form field definitions
 */
export const productFields: Field[] = [
  nameField,
  descriptionField,
  priceField,
  { name: "calories", label: "Calories", type: "text" },
  { name: "allergy_info", label: "Allergy Info", type: "text" },
  {
    name: "availability",
    label: "Available",
    type: "number",
    hint: "1 = available, 0 = unavailable",
  },
  mediaIdField,
];

/** Typed values from dataset product form (user-facing) */
export type DatasetProductFormValues = {
  name: string;
  price: string;
  media_id: number | null;
};

/**
 * Dataset product form field definitions (user-facing product CRUD)
 */
export const datasetProductFields: Field[] = [
  nameField,
  priceField,
  { name: "media_id", label: "Image", type: "number", hint: "Select from your media library" },
];
