# Xibo MCP Server Setup

This MCP (Model Context Protocol) server exposes all Xibo commands to AI assistants, allowing them to debug issues by running the same commands you're testing in the web interface.

## Installation

### For OpenCode

Add this to your OpenCode MCP settings file (usually `~/.config/opencode/mcp_settings.json` or accessible via Ctrl+P → "MCP Settings"):

```json
{
  "mcpServers": {
    "xibo": {
      "command": "ruby",
      "args": ["/home/user/git/xibo-scripts/mcp_server.rb"],
      "env": {
        "XIBO_API_URL": "your-xibo-api-url",
        "XIBO_CLIENT_ID": "your-client-id",
        "XIBO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

**Note:** Replace the environment variables with your actual Xibo API credentials, or omit the `env` section if you have them set in your shell environment.

### For Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "xibo": {
      "command": "ruby",
      "args": ["/home/user/git/xibo-scripts/mcp_server.rb"],
      "env": {
        "XIBO_API_URL": "your-xibo-api-url",
        "XIBO_CLIENT_ID": "your-client-id",
        "XIBO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Available Commands

The MCP server exposes all commands from the `xibo` CLI as tools:

### Menu Boards
- `menuboard_list` - List all menu boards
- `menuboard_show` - Show menu board details (requires `id`)
- `menuboard_create` - Create a new menu board (requires `name`, optional `code`, `description`)
- `menuboard_delete` - Delete a menu board (requires `id`)

### Categories
- `category_list` - List categories in a menu board (requires `menu_id`)
- `category_add` - Add category to menu board (requires `menu_id`, `name`, optional `code`, `description`)
- `category_delete` - Delete a category (requires `menu_id`)

### Products
- `product_list` - List products in category (requires `category_id`)
- `product_add` - Add product to category (requires `category_id`, `name`, optional fields)
- `product_delete` - Delete a product (requires `category_id`)

### Media
- `media_list` - List all media files
- `media_upload` - Upload a media file (requires `file`, `name`)
- `media_upload_image` - Upload an image (requires `name`, optional `random`, `url`, `size`)
- `media_delete` - Delete a media file (requires `id`)

### Layouts
- `layout_create` - Create menu layout (requires `category`, `menu_id`)
- `layout_status` - Check layout status
- `layout_show_grid` - Show grid layout
- `layout_debug` - Debug layout system

### Datasets
- `dataset_list` - List all datasets

## Testing

You can test the MCP server manually:

```bash
cd /home/user/git/xibo-scripts
ruby mcp_server.rb
```

Then send JSON-RPC requests via stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"menuboard_list","arguments":{}}}
```

## Benefits

With this MCP server, AI assistants can:
- Run the exact same commands you're debugging
- See the actual output and errors
- Help diagnose issues in real-time
- Suggest fixes based on actual command results

## Troubleshooting

If the MCP server doesn't work:

1. **Check Ruby is available:**
   ```bash
   which ruby
   ```

2. **Verify the script path is correct** in your MCP settings

3. **Check environment variables** are set correctly

4. **Look at the MCP server logs** (usually in your AI assistant's log files)

5. **Test the script manually** as shown in the Testing section above
