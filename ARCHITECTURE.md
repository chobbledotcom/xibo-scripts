# Xibo Scripts Architecture

## Overview

This application provides a CLI, MCP server, and web interface for managing Xibo CMS menu boards. It uses a unified parameter system and cache layer to ensure consistency across all interfaces.

## Core Systems

### 1. Unified Parameter System

The application uses a centralized parameter system to ensure consistency across all interfaces (CLI, MCP, Web).

### Components

#### 1. CommandMetadata (`lib/command_metadata.rb`)
**Single source of truth for all commands and their parameters.**

- Defines all available commands grouped by category
- Lists parameters required for each command
- Provides descriptions for commands
- Used by CLI, MCP server, and Web interface

Example:
```ruby
{
  name: 'menuboard:create',
  description: 'Create a new menu board',
  params: [:name, :code, :description]
}
```

#### 2. ParameterParser (`lib/parameter_parser.rb`)
**Handles parameter transformation between different formats.**

Manages three key transformations:
- **Internal format**: Symbol keys with internal names (`:allergy_info`)
- **API format**: String keys with API names (`"allergyInfo"`)
- **CLI format**: Command-line flags (`--allergy-info`)

Key features:
- Type conversion (string, integer, float, boolean)
- Parameter name mapping (e.g., `allergy_info` ↔ `allergyInfo`)
- Consistent handling across all interfaces

Example usage:
```ruby
# Convert internal params to API format
internal_params = { name: "Coffee", allergy_info: "Contains caffeine" }
api_params = ParameterParser.parse(internal_params, format: :api)
# => { "name" => "Coffee", "allergyInfo" => "Contains caffeine" }

# Convert to CLI args
cli_args = ParameterParser.to_cli_args(internal_params)
# => ["--name", "Coffee", "--allergy-info", "Contains caffeine"]
```

### Data Flow

#### CLI Interface
```
User input → OptionParser (xibo) → options hash (symbols) 
  → Command class → ParameterParser → API params (strings)
  → XiboClient → Xibo API
```

#### MCP Interface
```
MCP client → mcp_server.rb → CLI args → xibo executable
  → OptionParser → options hash → ParameterParser 
  → XiboClient → Xibo API
```

#### Web Interface
```
Web form → Rails params → xibo_command_runner.rb → CLI args
  → xibo executable → OptionParser → options hash
  → ParameterParser → XiboClient → Xibo API
```

### Key Design Principles

1. **Single Source of Truth**: All command definitions live in `CommandMetadata`
2. **Consistent Transformation**: `ParameterParser` handles all format conversions
3. **Type Safety**: Automatic type conversion based on parameter definitions
4. **API Compatibility**: Parameters automatically mapped to Xibo API expectations

### Adding New Commands

To add a new command:

1. **Add to CommandMetadata** (`lib/command_metadata.rb`):
```ruby
{
  name: 'category:update',
  description: 'Update a category',
  params: [:id, :name, :description]
}
```

2. **Add parameter definitions** (if new params) to `ParameterParser::PARAMETER_DEFINITIONS`:
```ruby
category_name: { 
  cli_flag: '--category-name', 
  api_name: 'categoryName', 
  type: :string 
}
```

3. **Create command class** (`lib/commands/category/update_command.rb`):
```ruby
module Commands
  module Category
    class UpdateCommand < BaseCommand
      include CrudOperations
      
      def execute
        # Build attributes from options
        attributes = {
          name: options[:name],
          description: options[:description]
        }.compact
        
        # ParameterParser handles conversion automatically
        update_entity(:category, options[:id], attributes)
      end
    end
  end
end
```

That's it! The command will automatically work across CLI, MCP, and Web interfaces.

### Benefits

- **No duplication**: Command definitions exist in one place
- **Type safety**: Automatic type conversion prevents errors
- **Consistency**: Same behavior across all interfaces
- **Maintainability**: Changes propagate automatically
- **API compatibility**: Automatic mapping to Xibo API names

### 2. Cache System

The application uses a file-based cache system to store API responses and avoid unnecessary API calls.

#### CacheService (`lib/cache_service.rb`)
**Centralized cache management for CLI and Web interfaces.**

Key features:
- Stores cache files in `tmp/cache/` directory
- JSON-based storage format
- No expiration - cache is always valid since this is the only client making changes
- Automatic cache invalidation after create/update/delete operations

Cache keys:
- `menuboards` - List of all menu boards
- `categories` - List of all categories
- `categories_{menu_id}` - Categories for specific menu board
- `products` - List of all products
- `products_{category_id}` - Products for specific category

Example usage:
```ruby
# Fetch with automatic caching
data = CacheService.fetch('menuboards') do
  client.request('/menuboards')
end

# Invalidate after changes
CacheService.invalidate('menuboards')
```

#### Cache Invalidation Strategy

The `CrudOperations` module automatically invalidates relevant caches:
- Creating/deleting menu boards → invalidates `menuboards`
- Creating/deleting categories → invalidates `menuboards` and `categories`
- Creating/deleting products → invalidates `menuboards`, `categories`, and `products`

#### Rails Integration

The Rails web interface uses the same cache directory (`xibo-scripts/tmp/cache/`) to share cached data with the CLI. This ensures consistent data across interfaces without duplicate API calls.

### Migration from Seed Files

The system was previously using static seed files (`seeds/*.json`) that had to be manually synchronized. This has been replaced with:
- **Dynamic caching**: Data is fetched from live API and cached
- **Automatic invalidation**: Cache updates when data changes
- **Shared cache**: CLI and Web interface use same cache files
- **No manual sync**: Removed all seed file update logic

### System Design Principles

1. **Single Source of Truth**: All command definitions live in `CommandMetadata`
2. **Consistent Transformation**: `ParameterParser` handles all format conversions
3. **Type Safety**: Automatic type conversion based on parameter definitions
4. **API Compatibility**: Parameters automatically mapped to Xibo API expectations
5. **Cache Coherence**: Single client assumption allows aggressive caching
6. **Shared Resources**: CLI and Web share cache for consistency

### Migration Notes

The system was refactored to eliminate:
- Duplicate command definitions in `mcp_server.rb` and `xibo_command_runner.rb`
- Inconsistent parameter handling (symbol vs string keys)
- Manual parameter name transformations scattered across command classes
- Type conversion bugs from inconsistent parsing
- Static seed files that required manual synchronization
- Duplicate API calls between CLI and Web interfaces
