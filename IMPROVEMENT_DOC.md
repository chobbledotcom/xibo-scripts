# Improvement Plan: Multi-Tenant Menu Display Management

Transform the current admin-only Xibo management tool into a multi-tenant platform where ice cream van, restaurant, and takeaway owners ("users") manage their own menu displays via screens powered by Xibo CMS.

## Role Hierarchy

| Role | Can Create | Can See | Key Privileges |
|------|-----------|---------|----------------|
| **Owner** | Managers, Users | Everything | Settings, sessions, full user management |
| **Manager** | Users only | Everything except settings/sessions | Business/screen management, shared photos, impersonation |
| **User** | Nothing | Own businesses only | Product management, menu screen editing |

## Key Entities

```
Owner/Manager
  └─ Business (name, Xibo folder, Xibo dataset)
       ├─ Screen (name, Xibo display)
       │    └─ Menu Screens (ordered, timed, each is a Xibo layout)
       │         └─ Menu Items (name, image, price, order)
       ├─ Users (assigned to business)
       └─ Media Folder (per-business in Xibo, "{name}-{suffix}")

Shared Photo Repository (single Xibo folder, managed by owners/managers)
```

## Xibo Data Strategy

Everything that Xibo needs to render displays lives in Xibo. Our database stores configuration, mappings, and access control. Specifically:

- **Product images** → Xibo media library (shared folder + per-business folders)
- **Product data** → Xibo datasets (one per business, columns: name, price, media_id, available, sort_order)
- **Menu screens** → Xibo layouts (generated from templates with product data)
- **Screen scheduling** → Xibo campaigns/schedules (layout rotation per display)
- **Business/screen/user mappings** → Our libsql database

## Phases

| Phase | Depends On | Delivers | Parallelizable |
|-------|-----------|----------|----------------|
| [**1: Auth & Data Model**](IMPROVEMENT_PART1.md) | — | Roles, DB schema, guards, navigation | No (foundation) |
| [**2: Business & Screen Admin**](IMPROVEMENT_PART2.md) | Phase 1 | Business/screen CRUD, Xibo provisioning, impersonation | Yes (with Phase 3) |
| [**3: Media Management**](IMPROVEMENT_PART3.md) | Phase 1 | Shared photos, per-business media, isolation | Yes (with Phase 2) |
| [**4: User Dashboard & Products**](IMPROVEMENT_PART4.md) | Phases 2 + 3 | User dashboard, product CRUD via Xibo datasets | No |
| [**5: Menu Screens & Scheduling**](IMPROVEMENT_PART5.md) | Phase 4 | Menu builder, Xibo layout generation, display scheduling | No |

## Route Structure

After all phases, the route structure will be:

```
/admin/*          → Owner/manager administration
  /admin/businesses
  /admin/business/:id
  /admin/business/:id/screens
  /admin/media/shared
  /admin/users
  /admin/settings      (owner only)
  /admin/sessions      (owner only)

/dashboard/*      → User-facing pages
  /dashboard
  /dashboard/business/:id
  /dashboard/business/:id/products
  /dashboard/business/:id/product/create
  /dashboard/media
  /dashboard/media/upload
  /dashboard/business/:bizId/screen/:screenId/menus
  /dashboard/business/:bizId/screen/:screenId/menu/create
```

## Open Questions for Implementation

1. **Dataset vs Menu Board**: This plan uses Xibo datasets for product storage (always available, flexible schema). If the menu board module is confirmed available, it could be used instead — the interface would be the same from our side.

2. **Template design**: Layout templates will be designed collaboratively outside this system. Phase 5 ships with placeholder templates that can be swapped later.

3. **Multi-business users**: A user assigned to multiple businesses needs a business switcher. The dashboard handles this, but media/product routes need to know which business context is active.

4. **Xibo display availability**: Displays must be registered in Xibo before they can be assigned to screens. The admin workflow is: set up physical device → register in Xibo (auto or manual) → assign to screen in our system.
