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

    test("renders textarea with value", () => {
      const field: Field = {
        name: "notes",
        label: "Notes",
        type: "textarea",
      };
      const html = renderField(field, "Some notes here");
      expect(html).toContain("Some notes here");
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
      // read and admin should be checked
      expect(html).toContain("checked");
    });

    test("escapes HTML in field values", () => {
      const field: Field = {
        name: "name",
        label: "Name",
        type: "text",
      };
      const html = renderField(field, '<script>alert("xss")</script>');
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
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
          name: "tags",
          label: "Tags",
          type: "checkbox-group",
          required: true,
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ];
      // URLSearchParams with multiple values for same key
      const form = new URLSearchParams();
      form.append("tags", "a");
      form.append("tags", "b");
      const result = validateForm(form, fields);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values.tags).toBe("a,b");
      }
    });

    test("returns error from custom validate function", () => {
      const fields: Field[] = [
        {
          name: "code",
          label: "Code",
          type: "text",
          required: true,
          validate: (v) => (v.length > 3 ? null : "Code must be longer than 3"),
        },
      ];
      const form = new URLSearchParams({ code: "ab" });
      const result = validateForm(form, fields);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Code must be longer than 3");
      }
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
