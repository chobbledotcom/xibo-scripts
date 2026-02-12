/**
 * User menu screen management page templates
 *
 * Menu screens are user-configured Xibo layouts built from templates.
 * Users create them, pick products, and the system publishes
 * them as a campaign to a Xibo display.
 */

import { renderError, renderFields } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import type { AdminSession } from "#lib/types.ts";
import type { DisplayBusiness } from "#lib/db/businesses.ts";
import type { DisplayScreen } from "#lib/db/screens.ts";
import type { DisplayMenuScreen } from "#lib/db/menu-screens.ts";
import type { DatasetProduct } from "#xibo/types.ts";
import type { LayoutTemplate } from "#lib/templates/index.ts";
import { menuScreenFields } from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";
import { UserBreadcrumb, UserNav } from "#templates/user/nav.tsx";

/** Breadcrumb back to screen's menu list */
const MenuBreadcrumb = (
  { bizId, screenId }: { bizId: number; screenId: number },
): JSX.Element => (
  <UserBreadcrumb
    href={`/dashboard/business/${bizId}/screen/${screenId}/menus`}
    label="Menu Screens"
  />
);

/**
 * Menu screen list page for a screen
 */
export const userMenuScreenListPage = (
  session: AdminSession,
  business: DisplayBusiness,
  screen: DisplayScreen,
  menuScreens: DisplayMenuScreen[],
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title={`Menu Screens - ${screen.name}`}>
      <UserNav session={session} />
      <UserBreadcrumb
        href={`/dashboard/business/${business.id}`}
        label={business.name}
      />
      <h1>Menu Screens - {screen.name}</h1>

      <Raw html={renderError(error)} />
      {success && <div class="success">{success}</div>}

      <p>
        <a
          href={`/dashboard/business/${business.id}/screen/${screen.id}/menu/create`}
        >
          <button type="button">Add Menu Screen</button>
        </a>
      </p>

      {menuScreens.length === 0
        ? <p>No menu screens yet. Add your first menu screen above.</p>
        : (
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Template</th>
                  <th>Display Time</th>
                  <th>Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {menuScreens.map((ms) => (
                  <tr>
                    <td>
                      <a
                        href={`/dashboard/business/${business.id}/screen/${screen.id}/menu/${ms.id}`}
                      >
                        {ms.name}
                      </a>
                    </td>
                    <td>{ms.template_id}</td>
                    <td>{ms.display_time}s</td>
                    <td>{ms.sort_order}</td>
                    <td>
                      <form
                        class="inline"
                        method="POST"
                        action={`/dashboard/business/${business.id}/screen/${screen.id}/menu/${ms.id}/delete`}
                        style="display:inline"
                      >
                        <input
                          type="hidden"
                          name="csrf_token"
                          value={session.csrfToken}
                        />
                        <button type="submit" class="error">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Layout>,
  );

/** Render template picker as radio buttons */
const renderTemplatePicker = (
  templates: LayoutTemplate[],
  selectedId: string | null,
): string =>
  String(
    <fieldset>
      <legend>Layout Template</legend>
      {templates.map((t) => (
        <label style="display:block; margin:0.5rem 0;">
          <input
            type="radio"
            name="template_id"
            value={t.id}
            required
            checked={t.id === selectedId}
          />
          {" "}
          <strong>{t.name}</strong> (max {String(t.maxProducts)} products)
          <br />
          <small>{t.description}</small>
        </label>
      ))}
    </fieldset>,
  );

/** Render product picker as checkboxes */
const renderProductPicker = (
  products: DatasetProduct[],
  selectedIds: number[],
  maxProducts: number | null,
): string => {
  if (products.length === 0) {
    return String(
      <p>No products available. Add products to your business first.</p>,
    );
  }

  const selectedSet = new Set(selectedIds);
  return String(
    <fieldset>
      <legend>
        Select Products{maxProducts !== null
          ? ` (max ${String(maxProducts)})`
          : ""}
      </legend>
      {products
        .filter((p) => p.available === 1)
        .map((p) => (
          <label style="display:block; margin:0.25rem 0;">
            <input
              type="checkbox"
              name="product_ids"
              value={String(p.id)}
              checked={selectedSet.has(p.id)}
            />
            {" "}
            {p.name} - {p.price}
          </label>
        ))}
    </fieldset>,
  );
};

/**
 * Menu screen create form page
 */
export const userMenuScreenCreatePage = (
  session: AdminSession,
  business: DisplayBusiness,
  screen: DisplayScreen,
  templates: LayoutTemplate[],
  products: DatasetProduct[],
  error?: string,
): string =>
  String(
    <Layout title={`Add Menu Screen - ${screen.name}`}>
      <UserNav session={session} />
      <MenuBreadcrumb bizId={business.id} screenId={screen.id} />
      <h1>Add Menu Screen - {screen.name}</h1>

      <Raw html={renderError(error)} />

      <form
        method="POST"
        action={`/dashboard/business/${business.id}/screen/${screen.id}/menu/create`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(menuScreenFields)} />
        <Raw html={renderTemplatePicker(templates, null)} />
        <Raw html={renderProductPicker(products, [], null)} />
        <button type="submit">Create Menu Screen</button>
      </form>
    </Layout>,
  );

/**
 * Menu screen edit form page
 */
export const userMenuScreenEditPage = (
  session: AdminSession,
  business: DisplayBusiness,
  screen: DisplayScreen,
  menuScreen: DisplayMenuScreen,
  templates: LayoutTemplate[],
  products: DatasetProduct[],
  selectedProductIds: number[],
  error?: string,
): string => {
  const maxProducts = templates.find((t) => t.id === menuScreen.template_id)?.maxProducts ?? null;
  return String(
    <Layout title={`Edit ${menuScreen.name} - ${screen.name}`}>
      <UserNav session={session} />
      <MenuBreadcrumb bizId={business.id} screenId={screen.id} />
      <h1>Edit {menuScreen.name}</h1>

      <Raw html={renderError(error)} />

      <form
        method="POST"
        action={`/dashboard/business/${business.id}/screen/${screen.id}/menu/${menuScreen.id}`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw
          html={renderFields(menuScreenFields, {
            name: menuScreen.name,
            display_time: menuScreen.display_time,
            sort_order: menuScreen.sort_order,
          })}
        />
        <Raw
          html={renderTemplatePicker(templates, menuScreen.template_id)}
        />
        <Raw html={renderProductPicker(products, selectedProductIds, maxProducts)} />
        <button type="submit">Update Menu Screen</button>
      </form>
    </Layout>,
  );
};
