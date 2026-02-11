/**
 * Menu board admin page templates
 */

import { type FieldValues, renderFields } from "#lib/forms.tsx";
import { Raw } from "#lib/jsx/jsx-runtime.ts";
import type { AdminSession } from "#lib/types.ts";
import type {
  XiboCategory,
  XiboMenuBoard,
  XiboProduct,
} from "#xibo/types.ts";
import {
  categoryFields,
  menuBoardFields,
  productFields,
} from "#templates/fields.ts";
import { Layout } from "#templates/layout.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";

/**
 * Menu board list page
 */
export const menuBoardListPage = (
  session: AdminSession,
  boards: XiboMenuBoard[],
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title="Menu Boards">
      <AdminNav session={session} />
      <h2>Menu Boards</h2>

      {success && <div class="success">{success}</div>}
      {error && <div class="error">{error}</div>}

      <p>
        <a href="/admin/menuboard/new">New Menu Board</a>
      </p>

      {boards.length === 0
        ? <p>No menu boards found.</p>
        : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((board) => (
                <tr>
                  <td>
                    <a href={`/admin/menuboard/${board.menuId}`}>
                      {board.name}
                    </a>
                  </td>
                  <td>{board.code || "—"}</td>
                  <td>{board.description || "—"}</td>
                  <td>
                    <a href={`/admin/menuboard/${board.menuId}`}>View</a>
                    {" | "}
                    <a href={`/admin/menuboard/${board.menuId}/edit`}>
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Layout>,
  );

/**
 * Menu board detail page with categories and products tree
 */
export const menuBoardDetailPage = (
  session: AdminSession,
  board: XiboMenuBoard,
  categories: XiboCategory[],
  productsByCategory: Record<number, XiboProduct[]>,
  success?: string,
  error?: string,
): string =>
  String(
    <Layout title={board.name}>
      <AdminNav session={session} />
      <Breadcrumb href="/admin/menuboards" label="Menu Boards" />
      <h2>{board.name}</h2>

      {success && <div class="success">{success}</div>}
      {error && <div class="error">{error}</div>}

      <p>
        {board.code && (
          <span>
            Code: <strong>{board.code}</strong>{" | "}
          </span>
        )}
        {board.description && (
          <span>
            {board.description}{" | "}
          </span>
        )}
        <a href={`/admin/menuboard/${board.menuId}/edit`}>Edit Board</a>
        {" | "}
        <form
          method="POST"
          action={`/admin/menuboard/${board.menuId}/delete`}
          style="display:inline"
        >
          <input type="hidden" name="csrf_token" value={session.csrfToken} />
          <button type="submit" class="secondary">Delete Board</button>
        </form>
      </p>

      <h3>Categories</h3>
      <p>
        <a href={`/admin/menuboard/${board.menuId}/category/new`}>
          Add Category
        </a>
      </p>

      {categories.length === 0
        ? <p>No categories yet.</p>
        : (
          <div>
            {categories.map((cat) => (
              <section>
                <h4>
                  {cat.name}
                  {cat.code && <small> ({cat.code})</small>}
                </h4>
                <p>
                  <a
                    href={`/admin/menuboard/${board.menuId}/category/${cat.menuCategoryId}/edit`}
                  >
                    Edit
                  </a>
                  {" | "}
                  <form
                    method="POST"
                    action={`/admin/menuboard/${board.menuId}/category/${cat.menuCategoryId}/delete`}
                    style="display:inline"
                  >
                    <input
                      type="hidden"
                      name="csrf_token"
                      value={session.csrfToken}
                    />
                    <button type="submit" class="secondary">Delete</button>
                  </form>
                  {" | "}
                  <a
                    href={`/admin/menuboard/${board.menuId}/category/${cat.menuCategoryId}/product/new`}
                  >
                    Add Product
                  </a>
                </p>

                <ProductList
                  boardId={board.menuId}
                  categoryId={cat.menuCategoryId}
                  products={productsByCategory[cat.menuCategoryId] ?? []}
                  csrfToken={session.csrfToken}
                />
              </section>
            ))}
          </div>
        )}
    </Layout>,
  );

/**
 * Product list within a category
 */
const ProductList = ({
  boardId,
  categoryId,
  products,
  csrfToken,
}: {
  boardId: number;
  categoryId: number;
  products: XiboProduct[];
  csrfToken: string;
}): JSX.Element => {
  if (products.length === 0) {
    return <p><em>No products in this category.</em></p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Calories</th>
          <th>Available</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr>
            <td>
              {product.name}
              {product.description && (
                <small>
                  <br />
                  {product.description}
                </small>
              )}
            </td>
            <td>{product.price}</td>
            <td>{product.calories || "—"}</td>
            <td>{product.availability ? "Yes" : "No"}</td>
            <td>
              <a
                href={`/admin/menuboard/${boardId}/category/${categoryId}/product/${product.menuProductId}/edit`}
              >
                Edit
              </a>
              {" | "}
              <form
                method="POST"
                action={`/admin/menuboard/${boardId}/category/${categoryId}/product/${product.menuProductId}/delete`}
                style="display:inline"
              >
                <input
                  type="hidden"
                  name="csrf_token"
                  value={csrfToken}
                />
                <button type="submit" class="secondary">Delete</button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/**
 * Menu board new/edit form
 */
export const menuBoardFormPage = (
  session: AdminSession,
  board?: XiboMenuBoard,
): string => {
  const isEdit = !!board;
  const title = isEdit ? `Edit ${board.name}` : "New Menu Board";
  const action = isEdit
    ? `/admin/menuboard/${board.menuId}`
    : "/admin/menuboard";

  const values: FieldValues = board
    ? { name: board.name, code: board.code, description: board.description }
    : {};

  return String(
    <Layout title={title}>
      <AdminNav session={session} />
      <Breadcrumb
        href={
          isEdit
            ? `/admin/menuboard/${board.menuId}`
            : "/admin/menuboards"
        }
        label={isEdit ? board.name : "Menu Boards"}
      />
      <h2>{title}</h2>

      <form method="POST" action={action}>
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(menuBoardFields, values)} />
        <button type="submit">{isEdit ? "Save Changes" : "Create"}</button>
      </form>
    </Layout>,
  );
};

/**
 * Category new/edit form
 */
export const categoryFormPage = (
  session: AdminSession,
  boardId: number,
  boardName: string,
  category?: XiboCategory,
): string => {
  const isEdit = !!category;
  const title = isEdit ? `Edit ${category.name}` : "New Category";
  const action = isEdit
    ? `/admin/menuboard/${boardId}/category/${category.menuCategoryId}`
    : `/admin/menuboard/${boardId}/category`;

  const values: FieldValues = category
    ? {
      name: category.name,
      code: category.code,
      media_id: category.mediaId,
    }
    : {};

  return String(
    <Layout title={title}>
      <AdminNav session={session} />
      <Breadcrumb
        href={`/admin/menuboard/${boardId}`}
        label={boardName}
      />
      <h2>{title}</h2>

      <form method="POST" action={action}>
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(categoryFields, values)} />
        <button type="submit">{isEdit ? "Save Changes" : "Create"}</button>
      </form>
    </Layout>,
  );
};

/**
 * Product new/edit form
 */
export const productFormPage = (
  session: AdminSession,
  boardId: number,
  boardName: string,
  categoryId: number,
  categoryName: string,
  product?: XiboProduct,
): string => {
  const isEdit = !!product;
  const title = isEdit ? `Edit ${product.name}` : "New Product";
  const action = isEdit
    ? `/admin/menuboard/${boardId}/category/${categoryId}/product/${product.menuProductId}`
    : `/admin/menuboard/${boardId}/category/${categoryId}/product`;

  const values: FieldValues = product
    ? {
      name: product.name,
      description: product.description,
      price: product.price,
      calories: product.calories,
      allergy_info: product.allergyInfo,
      availability: product.availability,
      media_id: product.mediaId,
    }
    : { availability: 1 };

  return String(
    <Layout title={title}>
      <AdminNav session={session} />
      <Breadcrumb
        href={`/admin/menuboard/${boardId}`}
        label={boardName}
      />
      <h2>
        {title}
        <small> in {categoryName}</small>
      </h2>

      <form method="POST" action={action}>
        <input type="hidden" name="csrf_token" value={session.csrfToken} />
        <Raw html={renderFields(productFields, values)} />
        <button type="submit">{isEdit ? "Save Changes" : "Create"}</button>
      </form>
    </Layout>,
  );
};
