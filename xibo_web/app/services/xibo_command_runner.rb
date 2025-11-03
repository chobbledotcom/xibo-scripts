require 'open3'

class XiboCommandRunner
  XIBO_SCRIPT_PATH = File.expand_path('../../..', __dir__)
  XIBO_EXEC = File.join(XIBO_SCRIPT_PATH, 'xibo')

  # Available commands grouped by category
  COMMANDS = {
    'Media' => [
      { name: 'media:list', description: 'List all media files' },
      { name: 'media:upload', description: 'Upload a media file', params: [:file, :name] },
      { name: 'media:upload-image', description: 'Upload an image (random or from URL)', params: [:name, :random, :url, :size] },
      { name: 'media:delete', description: 'Delete a media file', params: [:id] }
    ],
    'Menu Boards' => [
      { name: 'menuboard:list', description: 'List all menu boards' },
      { name: 'menuboard:show', description: 'Show menu board details', params: [:id] },
      { name: 'menuboard:create', description: 'Create a new menu board', params: [:name, :code, :description] },
      { name: 'menuboard:delete', description: 'Delete a menu board', params: [:id] }
    ],
    'Categories' => [
      { name: 'category:add', description: 'Add category to menu board', params: [:menu_id, :name, :code, :description] },
      { name: 'category:delete', description: 'Delete a category', params: [:menu_id] }
    ],
    'Products' => [
      { name: 'product:list', description: 'List products in category', params: [:category_id] },
      { name: 'product:add', description: 'Add product to category', params: [:category_id, :name, :description, :price, :calories, :allergy_info, :code, :available] },
      { name: 'product:delete', description: 'Delete a product', params: [:category_id] }
    ],
    'Layouts' => [
      { name: 'layout:create', description: 'Create menu layout', params: [:category, :menu_id] },
      { name: 'layout:status', description: 'Check layout status' },
      { name: 'layout:show-grid', description: 'Show grid layout' },
      { name: 'layout:debug', description: 'Debug layout system' }
    ],
    'Datasets' => [
      { name: 'dataset:list', description: 'List all datasets' }
    ]
  }

  def self.available_commands
    COMMANDS
  end

  def self.run(command, options = {})
    # Build command with options
    cmd_parts = [XIBO_EXEC, command]

    # Add options
    options.each do |key, value|
      next if value.blank?

      option_flag = "--#{key.to_s.gsub('_', '-')}"

      # Handle boolean flags
      if value == true || value == 'true'
        cmd_parts << option_flag
      elsif value == false || value == 'false'
        # Skip false boolean values
        next
      else
        cmd_parts << option_flag
        cmd_parts << value.to_s
      end
    end

    # Execute command
    stdout, stderr, status = Open3.capture3(*cmd_parts, chdir: XIBO_SCRIPT_PATH)

    {
      stdout: stdout,
      stderr: stderr,
      success: status.success?,
      exit_code: status.exitstatus
    }
  rescue => e
    {
      stdout: '',
      stderr: e.message,
      success: false,
      exit_code: 1
    }
  end
end
