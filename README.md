# Xibo CMS Ruby Management Suite

![Tests](https://github.com/chobbledotcom/xibo-scripts/workflows/Tests/badge.svg)
[![Ruby](https://img.shields.io/badge/ruby-3.3-red.svg)](https://www.ruby-lang.org/)

A comprehensive Ruby CLI toolkit for managing Xibo CMS v4 digital signage systems, with specialized support for menu board management, media operations, and automated layout generation.

## Overview

This toolkit provides a powerful command-line interface to interact with Xibo CMS, featuring:
- **Menu Board Management**: Create and manage digital menu boards with categories, products, and pricing
- **Media Library Operations**: Upload, list, and manage media assets including automatic random image generation
- **Layout Automation**: Auto-generate 1080p portrait layouts with grid-based product displays
- **Data Seeding**: Intelligent incremental/force seeding system with JSON-based configuration
- **Swagger Validation**: Built-in API request/response validation against Xibo's OpenAPI spec
- **Developer Tools**: Debugging, status checking, and batch operations

## Architecture

### Core Components

- **XiboClient** (`lib/xibo_client.rb`): OAuth2-authenticated HTTP client with automatic request/response validation
- **CommandRegistry** (`lib/command_registry.rb`): Auto-discovery system for modular command loading
- **LayoutBuilder** (`lib/layout_builder.rb`): Generates 1080p portrait layouts with precise grid positioning
- **ImageManager** (`lib/image_manager.rb`): Handles image downloads (random or URL) and Xibo uploads
- **SwaggerValidator** (`lib/swagger_validator.rb`): Validates API calls against `swagger.json` specification
- **MenuSeeder** (`seed.rb`): Incremental data synchronization with force-rebuild option
- **SeedDataManager** (`lib/seed_data_manager.rb`): Centralized seed file reading/writing with CRUD operations
- **InteractiveEditor** (`lib/interactive_editor.rb`): Reusable module for interactive CLI workflows
- **CrudOperations** (`lib/crud_operations.rb`): Cohesive interface for create/delete with dual Xibo+seed sync

### Command Structure

Commands follow a `category:action` pattern with auto-discovery from `lib/commands/`:
```
lib/commands/
├── base_command.rb          # Base class with common utilities
├── media/                   # Media library operations
├── menuboard/               # Menu board CRUD
├── category/                # Menu category management
├── product/                 # Product management
├── dataset/                 # Dataset operations
└── layout/                  # Layout creation and debugging
```

## Installation

### Requirements

- Ruby 3.3+
- Bundler
- Xibo CMS v4 API access (URL, Client ID, Secret)

### Setup

1. **Clone and Install Dependencies**
```bash
git clone <repository>
cd xibo-scripts
bundle install
```

2. **Configure Environment Variables**

Create a `.env` file:
```bash
XIBO_API_URL=https://your-xibo-instance.com
XIBO_CLIENT_ID=your_client_id
XIBO_CLIENT_SECRET=your_client_secret
```

3. **Add Swagger Specification**

Place your Xibo CMS `swagger.json` in the project root for API validation.

### Nix Development Environment

This project includes a Nix flake for reproducible development:

```bash
# Enter development shell (requires Nix with flakes enabled)
nix develop

# Or use direnv for automatic activation
echo "use flake" > .envrc
direnv allow
```

### Docker Deployment

The project includes a production-ready Dockerfile for deploying the xibo_web Rails application.

**Environment Variables:**

The application can be configured via environment variables. A `.env` file is optional and will override environment variables if present:

- **Required:**
  - `XIBO_API_URL` - Your Xibo CMS instance URL
  - `XIBO_CLIENT_ID` - OAuth client ID
  - `XIBO_CLIENT_SECRET` - OAuth client secret

**Note:** The Docker image removes encrypted credentials files and generates a fresh `SECRET_KEY_BASE` on each container startup. This makes each container instance fully self-contained and stateless, with all configuration provided via environment variables.

**Building without Docker daemon:**

The development environment uses `buildah` and `podman` from Nix, which don't require a Docker daemon:

```bash
# Build with buildah (no daemon needed)
buildah bud -t xibo-web .

# Run with podman
podman run -d \
  -p 3000:3000 \
  --name xibo-web \
  -e XIBO_API_URL=https://your-xibo-instance.com \
  -e XIBO_CLIENT_ID=your_client_id \
  -e XIBO_CLIENT_SECRET=your_client_secret \
  xibo-web
```

**Running with Docker:**

```bash
# Build with Docker
docker build -t xibo-web .

# Run with environment variables
docker run -d \
  -p 3000:3000 \
  --name xibo-web \
  -e XIBO_API_URL=https://your-xibo-instance.com \
  -e XIBO_CLIENT_ID=your_client_id \
  -e XIBO_CLIENT_SECRET=your_client_secret \
  xibo-web

# Persist database with volume mount
docker run -d \
  -p 3000:3000 \
  --name xibo-web \
  -v xibo-data:/rails/storage \
  --env-file .env \
  xibo-web
```

**Key features**:
- Multi-stage build for minimal image size
- Ruby 3.3.6 (matches xibo_web/.ruby-version)
- Production-optimized with jemalloc
- SQLite database with persistent storage support
- Automatic database setup via docker-entrypoint
- Non-root user for security
- Asset precompilation included
- Builds without Docker daemon using buildah

#### Publishing to Docker Hub

Use the included `bin/docker-push` script to build and push to Docker Hub with automatic version bumping:

```bash
# One-time setup: Login to Docker Hub
podman login docker.io

# Build and push (automatically increments version)
docker-push

# The script will:
# 1. Auto-increment version (stored in .docker-version)
# 2. Build the image using buildah (no Docker daemon required)
# 3. Tag as dockerstefn/xibo:vX and :latest
# 4. Push both tags to Docker Hub using podman
```

The `docker-push` command is available automatically when direnv loads (adds `bin/` to PATH).

**Benefits of buildah/podman:**
- No Docker daemon required
- Works in rootless mode
- Compatible with Docker images
- Available via Nix flake

Pull the published image:
```bash
docker pull dockerstefn/xibo:latest
docker pull dockerstefn/xibo:v5  # specific version
```

Version tracking is automatic - each push increments the version number stored in `.docker-version`.

#### Testing the Docker Image

Use the included `bin/test-docker` script to test the Docker image build and basic functionality:

```bash
# Basic test with dummy credentials
./bin/test-docker

# Test with real Xibo credentials
XIBO_API_URL=https://your-xibo.com \
XIBO_CLIENT_ID=your_id \
XIBO_CLIENT_SECRET=your_secret \
./bin/test-docker
```

The test script will:
1. Build the image using buildah (no Docker daemon required)
2. Verify the image was created successfully
3. Start a test container on port 3001
4. Wait for Rails to boot and respond
5. Show container logs and diagnostics
6. Automatically clean up test containers and images on exit

**Features:**
- Pure Nix script with automatic dependency management
- Uses dummy credentials if real ones aren't provided
- Automatic cleanup on success or failure
- Color-coded logging (INFO/WARN/ERROR)
- Health checking with 30-second timeout

The `test-docker` command is available automatically when direnv loads (adds `bin/` to PATH).

## Usage

### Main CLI: `xibo`

The primary interface supporting all operations:

```bash
./xibo COMMAND [options]
./xibo --help  # Show all available commands
```

### Media Operations

#### List Media Library
```bash
./xibo media:list
# Shows hierarchical folder structure with media items
# 📁 Folder Name
#   🖼️ image.jpg (image) - ID: 123
```

#### Upload Media
```bash
# Upload local file
./xibo media:upload -f /path/to/file.jpg -n "Logo"

# Upload with folder assignment
./xibo media:upload -f banner.png -n "Banner" --folder-id 5
```

#### Upload Images (with automatic download)
```bash
# Random image from picsum.photos
./xibo media:upload-image --random -n "Product Photo" --size 800

# From specific URL
./xibo media:upload-image --url "https://example.com/image.jpg" -n "Banner"

# From local file
./xibo media:upload-image -f /path/to/image.jpg -n "Logo"
```

#### Delete Media
```bash
# With confirmation prompt
./xibo media:delete -i 123

# Force delete (skip confirmation)
./xibo media:delete -i 123 --force
```

### Menu Board Management

#### List Menu Boards
```bash
# Table view
./xibo menuboard:list

# JSON output
./xibo menuboard:list --json

# Filter by specific board
./xibo menuboard:list -i 1
```

#### Create Menu Board
Creates a menu board in both Xibo and seed data:

```bash
# With CLI options
./xibo menuboard:create -n "Lunch Menu" \
  --description "Daily lunch specials" \
  --code "LUNCH001"

# Interactive mode (prompts for all fields)
./xibo menuboard:create
```

#### Delete Menu Board
Deletes a menu board from both Xibo and seed data:

```bash
# Interactive selection
./xibo menuboard:delete

# Delete specific board by ID
./xibo menuboard:delete -i 1

# Force delete (skip confirmation)
./xibo menuboard:delete -i 1 --force
```

#### Show Menu Board Details
```bash
# Shows board details, categories, and products
./xibo menuboard:show -i 1

# JSON output
./xibo menuboard:show -i 1 --json

# Verbose mode (includes product descriptions)
./xibo menuboard:show -i 1 -v
```

#### Edit Menu Board
Comprehensive interactive editor for menu boards, categories, and products. Changes are saved to both Xibo and seed data:

```bash
# Interactive selection from all menu boards
./xibo menuboard:edit

# Edit specific menu board by ID
./xibo menuboard:edit -i 1
```

**Features**:
- **Menu-driven interface** - Navigate between board, category, and product editing
- **Multi-level editing** - Edit board details, categories, and products in one session
- **Dual sync** - Updates both Xibo environment and corresponding seed files
- **Current value display** - See existing values before making changes
- **Confirmation prompts** - Review changes before saving

**What you can edit**:
1. **Board Details**: name, code, description → saves to `seeds/menu_boards.json`
2. **Categories**: name, code, description → saves to `seeds/categories.json`
3. **Products**: name, description, price, calories, allergy info, code, availability → saves to `seeds/products.json`

**Example session**:
```
Fetching menu boards from Xibo...

=== Available Menu Boards ===
1. Vans [VANS001] - Ice cream and sorbet menu (ID: 1)
2. Lunch Menu [LUNCH001] - Daily lunch specials (ID: 2)

Select menu board number (1-2) or ID: 1

============================================================
Editing: Vans (ID: 1)
============================================================

What would you like to edit?
  1. Board details (name, code, description)
  2. Categories
  3. Products
  4. Exit

Select option (1-4): 3

Fetching categories...

--- Select Category ---
1. Ice Cream
2. Sorbets

Select category number (or 0 to cancel): 1

Fetching products...

--- Products in Ice Cream ---
1. Vanilla Bean - $4.75 (ID: 10)
2. Chocolate Fudge - $4.75 (ID: 11)
3. Strawberry - $4.50 [UNAVAILABLE] (ID: 12)

Select product number to edit (or 0 to cancel): 3

--- Edit Product ---
  ID:           12
  Name:         Strawberry
  Description:  Fresh strawberry ice cream
  Price:        $4.50
  Calories:     240
  Allergy Info: Contains dairy
  Code:         IC003
  Available:    No

New name (or press Enter to keep 'Strawberry'):
New description (or press Enter to keep 'Fresh strawberry ice cream'):
New price (or press Enter to keep '$4.50'): 4.75
New calories (or press Enter to keep '240'):
New allergy info (or press Enter to keep 'Contains dairy'):
New code (or press Enter to keep 'IC003'):
Available? (y/n, or press Enter to keep 'No'): y

Changes to be saved:
  price: $4.50 → $4.75
  availability: No → Yes

Save these changes? (y/n): y

Updating product in Xibo...
✓ Updated in Xibo (ID: 12)
Updating seed data file...
✓ Updated products.json
✓ Product updated successfully!

============================================================
Editing: Vans (ID: 1)
============================================================

What would you like to edit?
  1. Board details (name, code, description)
  2. Categories
  3. Products
  4. Exit

Select option (1-4): 4
ℹ Exiting editor
```

### Category Management

#### Add Category to Menu Board
Creates a category in both Xibo and seed data:

```bash
# With CLI options
./xibo category:add --menu-id 1 -n "Appetizers" \
  --description "Starter dishes" \
  --code "APP"

# Interactive mode
./xibo category:add --menu-id 1
```

#### Delete Category
Deletes a category from both Xibo and seed data:

```bash
# Interactive selection
./xibo category:delete --menu-id 1

# Force delete (skip confirmation)
./xibo category:delete --menu-id 1 --force
```

### Product Management

#### List Products in Category
```bash
# Table view with pricing and availability
./xibo product:list --category-id 5

# JSON output
./xibo product:list --category-id 5 --json
```

#### Add Product
Creates a product in both Xibo and seed data:

```bash
# With CLI options
./xibo product:add --category-id 5 \
  -n "Cheeseburger" \
  --description "Quarter pound burger with cheese" \
  --price 8.99 \
  --calories 650 \
  --allergy-info "Contains dairy, gluten" \
  --code "BURG001" \
  --available

# Mark as unavailable
./xibo product:add --category-id 5 -n "Sold Out Item" \
  --price 5.99 --no-available

# Interactive mode (prompts for all fields)
./xibo product:add --category-id 5
```

#### Delete Product
Deletes a product from both Xibo and seed data:

```bash
# Interactive selection
./xibo product:delete --category-id 5

# Force delete (skip confirmation)
./xibo product:delete --category-id 5 --force
```

### Layout Operations

#### Create Menu Layout
Auto-generates 1080x1920 portrait layout with:
- Header region (950x250px, centered)
- 3x4 product grid (12 slots)
- Automatic widget placement

```bash
./xibo layout:create --category "Ice Cream" --menu-id 1

# Show grid visualization
./xibo layout:create --category "Sorbets" --menu-id 1 --show-grid
```

#### Show Grid Layout
Display the calculated grid positioning:
```bash
./xibo layout:show-grid
```

Output shows precise positioning for 1080x1920 portrait:
```
📐 Layout Grid Visualization (1080x1920 portrait)
Header: 65, 0, 950x250
Grid area: 0, 250, 1080x1670
Box size: 166x313, Margin: 83
Product positions:
  Product 1: (83, 333) 166x313
  Product 2: (332, 333) 166x313
  ...
```

#### Debug Layout System
```bash
./xibo layout:debug
# Shows:
# - Available resolutions
# - Existing layouts
# - Region and playlist details
```

#### Check Layout Status
```bash
# List all layouts
./xibo layout:status

# Detailed status for specific layout
./xibo layout:status -i 123

# Include full JSON response
./xibo layout:status -i 123 --json
```

#### Delete All Layouts
```bash
# Interactive confirmation
./xibo layout:delete-all

# Force delete (skip confirmation)
./xibo layout:delete-all --force

# Preserves Default Layout (ID 1) and system layouts
```

### Dataset Operations

#### List Datasets
```bash
./xibo dataset:list
# 📊 Dataset Name - ID: 5
#    Description: Product inventory
#    Columns: 8
#    Rows: 150
```

## Data Seeding

The `seed.rb` script provides intelligent data synchronization from JSON seed files.

### Seed Files

Located in `seeds/`:
- **`menu_boards.json`**: Menu board definitions
- **`categories.json`**: Category definitions
- **`products.json`**: Products organized by category name

### Seeding Modes

#### Incremental Sync (Default)
Updates existing data, adds new items, removes items not in seed files:
```bash
./seed.rb
```

Features:
- Updates only changed fields
- Reuses existing media assets
- Preserves data not in seed files
- Safe for production

#### Force Mode (Complete Rebuild)
Deletes all existing menu boards, categories, products, and media, then recreates from seeds:
```bash
./seed.rb --force
```

**⚠️ Warning**: Requires confirmation. Destroys all existing data.

### Seeding Process

1. **Menu Boards**: Creates/updates boards by name
2. **Categories**: Syncs categories for each board
3. **Products**: Syncs products with automatic image generation
   - Downloads random images from picsum.photos
   - Uploads to Xibo media library
   - Links to product entries
   - Reuses existing images in incremental mode
4. **Cleanup**: Removes items not in seed files

### Example Seed Data

**`seeds/menu_boards.json`**:
```json
{
  "boards": [
    {
      "name": "Vans",
      "description": "Ice cream and sorbet menu",
      "code": "VANS001"
    }
  ]
}
```

**`seeds/categories.json`**:
```json
{
  "categories": [
    {
      "name": "Ice Cream",
      "description": "Delicious ice cream flavors",
      "code": "ICE"
    }
  ]
}
```

**`seeds/products.json`**:
```json
{
  "products": {
    "Ice Cream": [
      {
        "name": "Vanilla Bean",
        "description": "Premium Madagascar vanilla",
        "price": 4.75,
        "calories": 260,
        "allergyInfo": "Contains dairy",
        "code": "IC001",
        "availability": 1
      }
    ]
  }
}
```

## Auxiliary Tools

### `api.rb` - Standalone API Explorer

Direct API interaction without the command framework:

```bash
./api.rb --list-media
# Displays media library tree structure
# Useful for quick checks and debugging
```

## Global Options

Available across all commands:

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Detailed operation logging |
| `-d, --debug` | Enable debug output and show Swagger validation |
| `--json` | Output results in JSON format |
| `--force` | Skip confirmation prompts |
| `-h, --help` | Display help information |

## Advanced Features

### Swagger Validation

Automatic validation of all API requests/responses against `swagger.json`:
- **Request Validation**: Checks required parameters and types
- **Response Validation**: Verifies response structure
- **Endpoint Discovery**: Lists available parameters for debugging

Enable debug mode to see validation details:
```bash
./xibo menuboard:list -d
```

### Layout Builder Specifications

The `LayoutBuilder` class generates precise 1080p portrait layouts:

**Constants**:
- `SCREEN_WIDTH`: 1080px
- `SCREEN_HEIGHT`: 1920px
- `HEADER_HEIGHT`: 250px
- `GRID_COLS`: 3
- `GRID_ROWS`: 4 (12 total products)
- `BOX_WIDTH`: ~166px (calculated for optimal margins)
- `BOX_MARGIN`: ~83px (half of box width)

**Calculation Formula**:
```
margin = box_width / 2
7 margins + 3 boxes = screen_width
box_width = screen_width / 6.5
```

### Image Manager Capabilities

The `ImageManager` handles:
- Random image downloads from picsum.photos
- Custom URL image downloads
- Local file uploads
- Automatic naming with timestamp suffixes
- Duplicate detection and resolution
- Temporary file management

### Error Handling

All commands include:
- Graceful error messages with ✓/✗/ℹ indicators
- Exception details in debug mode
- Non-zero exit codes on failure
- Automatic token refresh on 401 responses

## Development

### Adding New Commands

1. Create command file in appropriate category folder:
```ruby
# lib/commands/category_name/action_command.rb
require_relative '../base_command'

module Commands
  module CategoryName
    class ActionCommand < BaseCommand
      def self.description
        "Description for help output"
      end

      def execute
        # Implementation
        result = client.get('/endpoint')
        print_success("Operation completed")
        result
      end
    end
  end
end
```

2. Command is auto-discovered via `CommandRegistry`
3. Accessible as: `./xibo category-name:action`

### Testing

The project includes comprehensive unit tests using RSpec.

**Run all tests**:
```bash
bundle exec rake spec
# or
/opt/rbenv/versions/3.3.6/lib/ruby/gems/3.3.0/gems/rspec-core-3.13.6/exe/rspec
```

**Test coverage includes**:
- **SeedDataManager**: CRUD operations on seed files (menu_boards.json, categories.json, products.json)
- **InteractiveEditor**: User input handling, field prompts, confirmations, list selection

**Writing tests**:
```ruby
# spec/lib/my_feature_spec.rb
require 'spec_helper'
require_relative '../../lib/my_feature'

RSpec.describe MyFeature do
  it 'does something useful' do
    expect(MyFeature.new.process).to eq('expected result')
  end
end
```

**Test helpers**:
- Uses `webmock` to stub HTTP requests
- Uses `tmpdir` for isolated file system testing
- Includes custom matchers for common assertions

### Continuous Integration

The project uses GitHub Actions for automated testing:

**Triggers**:
- Automatically runs on all pull requests
- Runs on pushes to main/master branches
- Can be triggered manually via workflow_dispatch

**Workflow** (`.github/workflows/test.yml`):
```yaml
- Checks out code
- Sets up Ruby 3.3
- Installs dependencies with bundler cache
- Runs full RSpec test suite
- Reports results
```

**Status**: Check the badge at the top of this README for current test status.

**Manual run**: Go to Actions tab → Tests workflow → Run workflow

### Reusable Modules

**SeedDataManager** - Centralized seed data management:
```ruby
manager = SeedDataManager.new
manager.update_board('Menu Name', { 'name' => 'New Name' })
manager.update_category('Category Name', { 'code' => 'CAT001' })
manager.update_product('Category', 'Product', { 'price' => 4.99 })
```

**InteractiveEditor** - Interactive CLI workflows:
```ruby
class MyCommand < BaseCommand
  include InteractiveEditor

  def execute
    # Prompt for field with type conversion
    price = prompt_field('price', current_price, type: :float)

    # Select from list
    item = select_from_list(items, title: "Choose item")

    # Collect multiple field changes
    changes = collect_field_changes(entity, [
      { name: 'name' },
      { name: 'price', type: :float }
    ])

    # Confirm before saving
    save if confirm_changes(changes, old_values)
  end
end
```

**CrudOperations** - Cohesive CRUD interface with dual-sync:
```ruby
class MyCommand < BaseCommand
  include CrudOperations

  def execute
    # Create entity (updates both Xibo and seed data)
    result = create_entity(:board, { name: 'New Board' }, update_seeds: true)

    # Interactive create with prompts
    result = interactive_create(:board)

    # Delete entity (removes from both Xibo and seed data)
    delete_entity(:board, board_id, 'Board Name', update_seeds: true)

    # Interactive delete with selection
    boards = client.get('/menuboards')
    interactive_delete(:board, boards)
  end
end
```

**Supported entity types**:
- `:board` - Menu boards (menu_boards.json)
- `:category` - Categories (categories.json)
- `:product` - Products (products.json)

**Features**:
- Automatic Xibo API and seed data synchronization
- Interactive prompts with field validation
- Type conversion (string, float, integer, boolean)
- Confirmation dialogs
- Configurable entity schemas

### Project Structure

```
xibo-scripts/
├── xibo                     # Main CLI entry point
├── api.rb                   # Standalone API explorer
├── seed.rb                  # Data seeding script
├── swagger.json             # OpenAPI spec for validation
├── Rakefile                 # Task runner for tests
├── lib/
│   ├── xibo_client.rb       # Authenticated HTTP client
│   ├── command_registry.rb  # Command auto-discovery
│   ├── layout_builder.rb    # Layout generation engine
│   ├── image_manager.rb     # Image handling utilities
│   ├── swagger_validator.rb # API validation
│   ├── seed_data_manager.rb # Seed file CRUD operations
│   ├── interactive_editor.rb# Reusable interactive UI helpers
│   ├── crud_operations.rb   # Cohesive create/delete interface
│   └── commands/            # Modular command definitions
├── spec/                    # RSpec test suite
│   ├── spec_helper.rb       # Test configuration
│   └── lib/                 # Unit tests
├── seeds/                   # JSON seed data files
├── Gemfile                  # Ruby dependencies
└── flake.nix               # Nix development environment
```

### Dependencies

**Production**:
- **httparty**: HTTP client with multipart support
- **dotenv**: Environment variable management
- **json-schema**: API validation
- **terminal-table**: Formatted table output
- **colorize**: Terminal color output
- **optparse**: Command-line option parsing

**Testing**:
- **rspec**: BDD testing framework
- **webmock**: HTTP request stubbing
- **rake**: Task automation

## Troubleshooting

### Authentication Issues
```bash
# Verify credentials
./xibo media:list -d
# Check DEBUG output for authentication details
```

### Swagger Validation Errors
```bash
# View endpoint requirements
./xibo menuboard:list -d
# Shows required/optional parameters
```

### Layout Creation Issues
```bash
# Debug layout system
./xibo layout:debug

# Check specific layout status
./xibo layout:status -i <layout_id>
```

### Seeding Problems
```bash
# Use verbose mode
VERBOSE=1 ./seed.rb

# Use debug mode
DEBUG=1 ./seed.rb
```

## API Coverage

### Implemented Endpoints

- `/api/authorize/access_token` - OAuth2 authentication
- `/api/library` - Media library operations (GET, POST, DELETE)
- `/api/folders` - Folder structure
- `/api/menuboards` - Menu board management
- `/api/menuboard/{id}/category` - Category operations
- `/api/menuboard/{id}/product` - Product operations
- `/api/layout` - Layout management
- `/api/region/{layoutId}` - Region creation
- `/api/playlist/widget/*` - Widget management
- `/api/resolution` - Display resolutions
- `/api/dataset` - Dataset queries

## License

[Specify License]

## Contributing

[Contribution guidelines if applicable]

## Support

For issues related to:
- **Xibo CMS**: Refer to [Xibo documentation](https://xibosignage.com/docs)
- **This toolkit**: [Report issues here]
