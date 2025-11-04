# Centralized command metadata
# Single source of truth for all commands, parameters, and descriptions
module CommandMetadata
  # Command definitions with parameters
  COMMANDS = {
    'Media' => [
      {
        name: 'media:list',
        description: 'List all media files',
        params: []
      },
      {
        name: 'media:upload',
        description: 'Upload a media file',
        params: [:file, :name]
      },
      {
        name: 'media:upload-image',
        description: 'Upload an image (random or from URL)',
        params: [:name, :random, :url, :size]
      },
      {
        name: 'media:delete',
        description: 'Delete a media file',
        params: [:id]
      }
    ],
    'Menu Boards' => [
      {
        name: 'menuboard:list',
        description: 'List all menu boards',
        params: []
      },
      {
        name: 'menuboard:show',
        description: 'Show menu board details',
        params: [:id]
      },
      {
        name: 'menuboard:create',
        description: 'Create a new menu board',
        params: [:name, :code, :description]
      },
      {
        name: 'menuboard:edit',
        description: 'Edit a menu board',
        params: [:id, :name, :code, :description],
        hidden: true
      },
      {
        name: 'menuboard:delete',
        description: 'Delete a menu board',
        params: [:id]
      }
    ],
    'Categories' => [
      {
        name: 'category:list',
        description: 'List categories in menu board',
        params: [:menu_id]
      },
      {
        name: 'category:add',
        description: 'Add category to menu board',
        params: [:menu_id, :name, :code, :description]
      },
      {
        name: 'category:edit',
        description: 'Edit a category',
        params: [:id, :menu_id, :name, :code, :description],
        hidden: true
      },
      {
        name: 'category:delete',
        description: 'Delete a category',
        params: [:menu_id]
      }
    ],
    'Products' => [
      {
        name: 'product:list',
        description: 'List products in category',
        params: [:category_id]
      },
      {
        name: 'product:add',
        description: 'Add product to category',
        params: [:category_id, :name, :description, :price, :calories, :allergy_info, :code, :available]
      },
      {
        name: 'product:edit',
        description: 'Edit a product',
        params: [:id, :category_id, :name, :description, :price, :calories, :allergy_info, :code, :available],
        hidden: true
      },
      {
        name: 'product:delete',
        description: 'Delete a product',
        params: [:category_id]
      }
    ],
    'Layouts' => [
      {
        name: 'layout:create',
        description: 'Create menu layout',
        params: [:category, :menu_id]
      },
      {
        name: 'layout:status',
        description: 'Check layout status',
        params: []
      },
      {
        name: 'layout:show-grid',
        description: 'Show grid layout',
        params: []
      },
      {
        name: 'layout:debug',
        description: 'Debug layout system',
        params: []
      }
    ],
    'Datasets' => [
      {
        name: 'dataset:list',
        description: 'List all datasets',
        params: []
      }
    ]
  }.freeze

  # Get all commands grouped by category
  def self.all_commands
    COMMANDS
  end

  # Get parameters for a specific command
  # @param command_name [String] Command name (e.g., 'menuboard:create')
  # @return [Array<Symbol>] Parameter names
  def self.parameters_for(command_name)
    COMMANDS.each do |_category, commands|
      cmd = commands.find { |c| c[:name] == command_name }
      return cmd[:params] if cmd
    end
    []
  end

  # Get description for a specific command
  # @param command_name [String] Command name (e.g., 'menuboard:create')
  # @return [String] Description
  def self.description_for(command_name)
    COMMANDS.each do |_category, commands|
      cmd = commands.find { |c| c[:name] == command_name }
      return cmd[:description] if cmd
    end
    nil
  end

  # Get all commands as a flat list
  # @return [Array<Hash>] All commands
  def self.all_commands_flat
    COMMANDS.flat_map { |_category, commands| commands }
  end

  # Check if a command exists
  # @param command_name [String] Command name
  # @return [Boolean]
  def self.command_exists?(command_name)
    all_commands_flat.any? { |c| c[:name] == command_name }
  end

  # Get command metadata
  # @param command_name [String] Command name
  # @return [Hash, nil] Command metadata
  def self.metadata_for(command_name)
    COMMANDS.each do |category, commands|
      cmd = commands.find { |c| c[:name] == command_name }
      return cmd.merge(category: category) if cmd
    end
    nil
  end
end
