import { describe, expect, test } from "#test-compat";
import {
  type Field,
  renderError,
  renderField,
  renderFields,
  validateForm,
} from "#lib/forms.tsx";

describe("forms", () => {
  describe("renderField", () => {
    test("renders text input", () => {
      const field: Field = {
        name: "username",
        label: "Username",
        type: "text",
        required: true,
      };
      const html = renderField(field);
      expect(html).toContain("Username");
      expect(html).toContain('name="username"');
      expect(html).toContain('type="text"');
      expect(html).toContain("required");
    });

    test("renders password input", () => {
      const field: Field = {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
      };
      const html = renderField(field);
      expect(html).toContain('type="password"');
      expect(html).toContain('name="password"');
    });

    test("renders textarea", () => {
      const field: Field = {
        name: "notes",
        label: "Notes",
        type: "textarea",
      };
      const html = renderField(field);
      expect(html).toContain("<textarea");
      expect(html).toContain("</textarea>");
    });

    test("renders select with options", () => {
      const field: Field = {
        name: "role",
        label: "Role",
        type: "select",
        options: [
          { value: "admin", label: "Admin" },
          { value: "user", label: "User" },
        ],
      };
      const html = renderField(field);
      expect(html).toContain("<select");
      expect(html).toContain("Admin");
      expect(html).toContain("User");
    });

    test("renders checkbox group", () => {
      const field: Field = {
        name: "permissions",
        label: "Permissions",
        type: "checkbox-group",
        options: [
          { value: "read", label: "Read" },
          { value: "write", label: "Write" },
        ],
      };
      const html = renderField(field);
      expect(html).toContain('type="checkbox"');
      expect(html).toContain("Read");
      expect(html).toContain("Write");
    });

    test("renders with hint", () => {
      const field: Field = {
        name: "email",
        label: "Email",
        type: "email",
        hint: "We'll never share your email",
      };
      const html = renderField(field);
      expect(html).toContain("<small>");
      expect(html).toContain("We'll never share your email");
    });

    test("renders with placeholder", () => {
      const field: Field = {
        name: "url",
        label: "URL",
        type: "url",
        placeholder: "https://example.com",
      };
      const html = renderField(field);
      expect(html).toContain('placeholder="https://example.com"');
    });

    test("renders with value", () => {
      const field: Field = {
        name: "name",
        label: "Name",
        type: "text",
      };
      const html = renderField(field, "John");
      expect(html).toContain('value="John"');
    });

    test("renders date input", () => {
      const field: Field = {
        name: "start_date",
        label: "Start Date",
        type: "date",
      };
      const html = renderField(field);
      expect(html).toContain('type="date"');
    });

    test("renders datetime-local input", () => {
      const field: Field = {
        name: "event_time",
        label: "Event Time",
        type: "datetime-local",
      };
      const html = renderField(field);
      expect(html).toContain('type="datetime-local"');
    });

    test("renders textarea with pre-filled value", () => {
      const field: Field = {
        name: "notes",
        label: "Notes",
        type: "textarea",
      };
      const html = renderField(field, "pre-filled content");
      expect(html).toContain("pre-filled content");
    });

    test("renders select with selected value", () => {
      const field: Field = {
        name: "role",
        label: "Role",
        type: "select",
        options: [
          { value: "admin", label: "Admin" },
          { value: "user", label: "User" },
        ],
      };
      const html = renderField(field, "user");
      expect(html).toContain("selected");
    });

    test("renders checkbox-group with checked values", () => {
      const field: Field = {
        name: "perms",
        label: "Permissions",
        type: "checkbox-group",
        options: [
          { value: "read", label: "Read" },
          { value: "write", label: "Write" },
          { value: "admin", label: "Admin" },
        ],
      };
      const html = renderField(field, "read,admin");
      expect(html).toContain("checked");
    });

    test("escapes HTML in textarea value", () => {
      const field: Field = {
        name: "notes",
        label: "Notes",
        type: "textarea",
      };
      const html = renderField(field, "<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>alert");
    });

    test("renders with min attribute", () => {
      const field: Field = {
        name: "count",
        label: "Count",
        type: "number",
        min: 0,
      };
      const html = renderField(field);
      expect(html).toContain('min="0"');
    });

    test("renders with pattern attribute", () => {
      const field: Field = {
        name: "code",
        label: "Code",
        type: "text",
        pattern: "[A-Z]+",
      };
      const html = renderField(field);
      expect(html).toContain('pattern="[A-Z]+"');
    });

    test("renders with autofocus attribute", () => {
      const field: Field = {
        name: "name",
        label: "Name",
        type: "text",
        autofocus: true,
      };
      const html = renderField(field);
      expect(html).toContain("autofocus");
    });
  });

  describe("renderFields", () => {
    test("renders multiple fields", () => {
      const fields: Field[] = [
        { name: "username", label: "Username", type: "text", required: true },
        {
          name: "password",
          label: "Password",
          type: "password",
          required: true,
        },
      ];
      const html = renderFields(fields);
      expect(html).toContain("Username");
      expect(html).toContain("Password");
    });

    test("renders fields with values", () => {
      const fields: Field[] = [
        { name: "url", label: "URL", type: "url" },
      ];
      const html = renderFields(fields, { url: "https://xibo.example.com" });
      expect(html).toContain('value="https://xibo.example.com"');
    });
  });

  describe("validateForm", () => {
    test("validates required fields", () => {
      const fields: Field[] = [
        { name: "username", label: "Username", type: "text", required: true },
      ];
      const form = new URLSearchParams({ username: "" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Username is required");
      }
    });

    test("returns parsed values on success", () => {
      const fields: Field[] = [
        { name: "username", label: "Username", type: "text", required: true },
        { name: "count", label: "Count", type: "number" },
      ];
      const form = new URLSearchParams({ username: "admin", count: "5" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values.username).toBe("admin");
        expect(result.values.count).toBe(5);
      }
    });

    test("runs custom validator", () => {
      const fields: Field[] = [
        {
          name: "email",
          label: "Email",
          type: "email",
          required: true,
          validate: (v) => (v.includes("@") ? null : "Invalid email"),
        },
      ];
      const form = new URLSearchParams({ email: "notanemail" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Invalid email");
      }
    });

    test("accepts valid custom validation", () => {
      const fields: Field[] = [
        {
          name: "email",
          label: "Email",
          type: "email",
          required: true,
          validate: (v) => (v.includes("@") ? null : "Invalid email"),
        },
      ];
      const form = new URLSearchParams({ email: "test@example.com" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
    });

    test("parses number fields", () => {
      const fields: Field[] = [
        { name: "amount", label: "Amount", type: "number" },
      ];
      const form = new URLSearchParams({ amount: "42" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values.amount).toBe(42);
      }
    });

    test("returns null for empty number fields", () => {
      const fields: Field[] = [
        { name: "amount", label: "Amount", type: "number" },
      ];
      const form = new URLSearchParams({ amount: "" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values.amount).toBeNull();
      }
    });

    test("validates checkbox-group field (joins with commas)", () => {
      const fields: Field[] = [
        {
          name: "perms",
          label: "Permissions",
          type: "checkbox-group",
          options: [
            { value: "read", label: "Read" },
            { value: "write", label: "Write" },
          ],
        },
      ];
      const form = new URLSearchParams();
      form.append("perms", "read");
      form.append("perms", "write");
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values.perms).toBe("read,write");
      }
    });

    test("returns null for empty optional text field", () => {
      const fields: Field[] = [
        { name: "description", label: "Description", type: "text" },
      ];
      const form = new URLSearchParams({ description: "" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values.description).toBeNull();
      }
    });

    test("skips custom validate on empty optional field", () => {
      const fields: Field[] = [
        {
          name: "email",
          label: "Email",
          type: "email",
          validate: (_v) => "Should not run",
        },
      ];
      const form = new URLSearchParams({ email: "" });
      const result = validateForm(form, fields);
      // Should be valid because the field is optional and empty
      expect(result.valid).toBe(true);
    });
  });

  describe("renderError", () => {
    test("renders error div when error is present", () => {
      const html = renderError("Something went wrong");
      expect(html).toContain('class="error"');
      expect(html).toContain("Something went wrong");
    });

    test("returns empty string when no error", () => {
      expect(renderError()).toBe("");
      expect(renderError(undefined)).toBe("");
    });

    test("escapes HTML in error message", () => {
      const html = renderError("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>");
    });
  });
});
