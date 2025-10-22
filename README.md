# Xibo CMS Ruby Management Suite

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
```bash
./xibo menuboard:create -n "Lunch Menu" \
  --description "Daily lunch specials" \
  --code "LUNCH001"
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
Interactively edit an existing menu board. Changes are saved to both Xibo and seed data:

```bash
# Interactive selection from all menu boards
./xibo menuboard:edit

# Edit specific menu board by ID
./xibo menuboard:edit -i 1
```

**Interactive workflow**:
1. Select a menu board from the list (or use `-i` option)
2. View current values (name, code, description)
3. Enter new values or press Enter to keep existing
4. Confirm changes before saving
5. Updates both Xibo environment and `seeds/menu_boards.json`

**Example session**:
```
Fetching menu boards from Xibo...

=== Available Menu Boards ===
1. Vans [VANS001] - Ice cream and sorbet menu (ID: 1)
2. Lunch Menu [LUNCH001] - Daily lunch specials (ID: 2)

Select menu board number (1-2) or ID: 1

Current menu board details:
  ID:          1
  Name:        Vans
  Code:        VANS001
  Description: Ice cream and sorbet menu

New name (or press Enter to keep 'Vans'): Van's Ice Cream
New code (or press Enter to keep 'VANS001'):
New description (or press Enter to keep 'Ice cream and sorbet menu'): Premium ice cream and sorbet

Changes to be saved:
  name: Vans → Van's Ice Cream
  description: Ice cream and sorbet menu → Premium ice cream and sorbet

Save these changes? (y/n): y

Updating menu board in Xibo...
✓ Updated in Xibo (ID: 1)
Updating seed data file...
✓ Updated seed data file
✓ Menu board updated successfully!
```

### Category Management

#### Add Category to Menu Board
```bash
./xibo category:add --menu-id 1 -n "Appetizers" \
  --description "Starter dishes" \
  --code "APP"
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
```bash
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

### Project Structure

```
xibo-scripts/
├── xibo                    # Main CLI entry point
├── api.rb                  # Standalone API explorer
├── seed.rb                 # Data seeding script
├── swagger.json            # OpenAPI spec for validation
├── lib/
│   ├── xibo_client.rb      # Authenticated HTTP client
│   ├── command_registry.rb # Command auto-discovery
│   ├── layout_builder.rb   # Layout generation engine
│   ├── image_manager.rb    # Image handling utilities
│   ├── swagger_validator.rb # API validation
│   └── commands/           # Modular command definitions
├── seeds/                  # JSON seed data files
├── Gemfile                 # Ruby dependencies
└── flake.nix              # Nix development environment
```

### Dependencies

- **httparty**: HTTP client with multipart support
- **dotenv**: Environment variable management
- **json-schema**: API validation
- **terminal-table**: Formatted table output
- **colorize**: Terminal color output
- **optparse**: Command-line option parsing

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
