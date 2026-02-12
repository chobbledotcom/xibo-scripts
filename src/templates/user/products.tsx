/**
 * User product management page templates
 *
 * Products are rows in a per-business Xibo dataset. Users manage them
 * through these pages, and we sync to Xibo via the dataset API.
 */

import { renderError, renderFields } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import type { AdminSession, Business } from "#lib/types.ts";
import type { DatasetProduct } from "#xibo/types.ts";
import { datasetProductFields } from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";
import { UserBreadcrumb, UserNav } from "#templates/user/nav.tsx";

/** Available status label */
const availabilityLabel = (available: number): string =>
  available === 1 ? "Yes" : "No";

/**
 * Product list page for a business
 */
export const userProductListPage = (
  session: AdminSession,
  business: Business,
  products: DatasetProduct[],
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title={`Products - ${business.name}`}>
      <UserNav session={session} />
      <UserBreadcrumb href="/dashboard" label="Dashboard" />
      <h1>Products - {business.name}</h1>

      <Raw html={renderError(error)} />
      {success && <div class="success">{success}</div>}

      <p>
        <a href={`/dashboard/business/${business.id}/product/create`}>
          <button type="button">Add Product</button>
        </a>
      </p>

      {products.length === 0
        ? <p>No products yet. Add your first product above.</p>
        : (
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr>
                    <td>
                      <a
                        href={`/dashboard/business/${business.id}/product/${p.id}`}
                      >
                        {p.name}
                      </a>
                    </td>
                    <td>{p.price}</td>
                    <td>{availabilityLabel(p.available)}</td>
                    <td>
                      <form
                        class="inline"
                        method="POST"
                        action={`/dashboard/business/${business.id}/product/${p.id}/toggle`}
                        style="display:inline"
                      >
                        <input
                          type="hidden"
                          name="csrf_token"
                          value={session.csrfToken}
                        />
                        <button type="submit">
                          {p.available === 1 ? "Disable" : "Enable"}
                        </button>
                      </form>
                      {" "}
                      <form
                        class="inline"
                        method="POST"
                        action={`/dashboard/business/${business.id}/product/${p.id}/delete`}
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

/** Media option for the image picker */
interface MediaOption {
  mediaId: number;
  name: string;
}

/** Render image picker as a select with media options */
const renderImagePicker = (
  media: MediaOption[],
  selectedId: number | null,
  businessId: number,
): string => {
  if (media.length === 0) {
    return String(
      <p>
        No images available.{" "}
        <a href={`/dashboard/media?businessId=${businessId}`}>Upload photos</a>{" "}
        first.
      </p>,
    );
  }

  return String(
    <label>
      Image
      <select name="media_id">
        <option value="">No image</option>
        {media.map((m) => (
          <option
            value={String(m.mediaId)}
            selected={m.mediaId === selectedId}
          >
            {m.name}
          </option>
        ))}
      </select>
      <small>Select from your media library</small>
    </label>,
  );
};

/**
 * Product create form page
 */
export const userProductCreatePage = (
  session: AdminSession,
  business: Business,
  media: MediaOption[],
  error?: string,
): string =>
  String(
    <Layout title={`Add Product - ${business.name}`}>
      <UserNav session={session} />
      <UserBreadcrumb
        href={`/dashboard/business/${business.id}/products`}
        label="Products"
      />
      <h1>Add Product - {business.name}</h1>

      <Raw html={renderError(error)} />

      <form
        method="POST"
        action={`/dashboard/business/${business.id}/product/create`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw
          html={renderFields(
            datasetProductFields.filter((f) => f.name !== "media_id"),
          )}
        />
        <Raw
          html={renderImagePicker(
            media,
            null,
            business.id,
          )}
        />
        <button type="submit">Add Product</button>
      </form>
    </Layout>,
  );

/**
 * Product edit form page
 */
export const userProductEditPage = (
  session: AdminSession,
  business: Business,
  product: DatasetProduct,
  media: MediaOption[],
  error?: string,
): string =>
  String(
    <Layout title={`Edit ${product.name} - ${business.name}`}>
      <UserNav session={session} />
      <UserBreadcrumb
        href={`/dashboard/business/${business.id}/products`}
        label="Products"
      />
      <h1>Edit {product.name}</h1>

      <Raw html={renderError(error)} />

      <form
        method="POST"
        action={`/dashboard/business/${business.id}/product/${product.id}`}
      >
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw
          html={renderFields(
            datasetProductFields.filter((f) => f.name !== "media_id"),
            { name: product.name, price: product.price },
          )}
        />
        <Raw
          html={renderImagePicker(
            media,
            product.media_id,
            business.id,
          )}
        />
        <button type="submit">Update Product</button>
      </form>
    </Layout>,
  );
