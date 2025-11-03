# Xibo CMS Web Interface

A simple Ruby on Rails web application that wraps the Xibo CMS CLI scripts, providing a user-friendly web interface to manage your Xibo digital signage system.

## Features

- **Web-based UI**: Easy-to-use web interface for all Xibo CLI commands
- **Environment Configuration**: Automatic detection of XIBO API credentials
- **Command Categories**: Organized commands by category (Media, Menu Boards, Categories, Products, Layouts, Datasets)
- **Real-time Execution**: Run commands and see results immediately
- **Parameter Forms**: Dynamic forms for each command with appropriate input types

## Prerequisites

- Ruby 3.3+
- Rails 8.1+
- Working Xibo CMS API credentials (set as environment variables)

## Installation

1. **Install dependencies:**
   ```bash
   cd xibo_web
   bundle install
   ```

2. **Set up environment variables:**

   Create a `.env` file in the `xibo_web` directory with your Xibo credentials:
   ```bash
   XIBO_API_URL=https://your-xibo-instance.com
   XIBO_CLIENT_ID=your_client_id
   XIBO_CLIENT_SECRET=your_client_secret
   ```

## Running the Application

1. **Start the Rails server:**
   ```bash
   bin/rails server
   ```

2. **Open your browser:**
   Navigate to `http://localhost:3000`

3. **Use the interface:**
   - The home page shows all available commands grouped by category
   - Each command has a form with the required parameters
   - Click "Run Command" to execute
   - Results are displayed on a new page with stdout/stderr output

## Available Commands

### Media
- `media:list` - List all media files
- `media:upload` - Upload a media file
- `media:upload-image` - Upload an image (random or from URL)
- `media:delete` - Delete a media file

### Menu Boards
- `menuboard:list` - List all menu boards
- `menuboard:show` - Show menu board details
- `menuboard:create` - Create a new menu board
- `menuboard:delete` - Delete a menu board

### Categories
- `category:add` - Add category to menu board
- `category:delete` - Delete a category

### Products
- `product:list` - List products in category
- `product:add` - Add product to category
- `product:delete` - Delete a product

### Layouts
- `layout:create` - Create menu layout
- `layout:status` - Check layout status
- `layout:show-grid` - Show grid layout
- `layout:debug` - Debug layout system

### Datasets
- `dataset:list` - List all datasets

## Architecture

### Components

- **XiboCommandRunner** (`app/services/xibo_command_runner.rb`): Service class that wraps the CLI scripts
- **XiboController** (`app/controllers/xibo_controller.rb`): Handles web requests and command execution
- **Views** (`app/views/xibo/`): HTML/ERB templates for the UI

### How It Works

1. User accesses the web interface
2. Available commands are displayed from `XiboCommandRunner::COMMANDS`
3. User fills out a form and submits
4. Controller calls `XiboCommandRunner.run(command, options)`
5. Service executes the CLI script using `Open3.capture3`
6. Results (stdout, stderr, exit code) are displayed to the user

## Configuration

### Adding New Commands

To add a new command to the web interface, update the `COMMANDS` hash in `app/services/xibo_command_runner.rb`:

```ruby
'Category Name' => [
  {
    name: 'command:action',
    description: 'Description of what it does',
    params: [:param1, :param2]  # Optional
  }
]
```

### Environment Variables

The application requires these environment variables:
- `XIBO_API_URL` - Your Xibo CMS instance URL
- `XIBO_CLIENT_ID` - OAuth client ID
- `XIBO_CLIENT_SECRET` - OAuth client secret

These are loaded via `dotenv-rails` from the `.env` file.

## Testing

The web interface provides visual feedback:
- ✓ Green checkmarks for set environment variables
- Command output displayed in monospace font
- Success/error indicators with color coding
- Exit codes for debugging

## Production Deployment

For production use:

1. Set environment variables on your server
2. Precompile assets:
   ```bash
   RAILS_ENV=production bin/rails assets:precompile
   ```
3. Use a production-grade web server (Puma, Unicorn, etc.)
4. Configure SSL/TLS for secure access
5. Set up authentication/authorization as needed

## Troubleshooting

### Commands not running
- Check that the parent xibo scripts have dependencies installed
- Verify the `XIBO_SCRIPT_PATH` in `XiboCommandRunner` is correct
- Check Rails logs: `tail -f log/development.log`

### Environment variables not showing
- Verify `.env` file exists in the Rails app directory
- Check that `dotenv-rails` gem is installed
- Restart the Rails server after changing `.env`

## License

Same as the parent Xibo scripts project.
