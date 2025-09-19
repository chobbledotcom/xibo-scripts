require_relative 'commands/media/list_command'
require_relative 'commands/media/upload_command'
require_relative 'commands/media/delete_command'
require_relative 'commands/dataset/list_command'
require_relative 'commands/menuboard/list_command'
require_relative 'commands/menuboard/show_command'
require_relative 'commands/menuboard/create_command'
require_relative 'commands/category/add_command'
require_relative 'commands/product/add_command'
require_relative 'commands/product/list_command'

module CommandRegistry
  COMMANDS = {
    media: {
      list: Commands::Media::ListCommand,
      upload: Commands::Media::UploadCommand,
      delete: Commands::Media::DeleteCommand
    },
    dataset: {
      list: Commands::Dataset::ListCommand
    },
    menuboard: {
      list: Commands::Menuboard::ListCommand,
      show: Commands::Menuboard::ShowCommand,
      create: Commands::Menuboard::CreateCommand
    },
    category: {
      add: Commands::Category::AddCommand
    },
    product: {
      add: Commands::Product::AddCommand,
      list: Commands::Product::ListCommand
    }
  }.freeze

  def self.get_command(category, action)
    COMMANDS.dig(category, action)
  end

  def self.available_commands
    commands = []
    COMMANDS.each do |category, actions|
      actions.keys.each do |action|
        commands << "#{category}:#{action}"
      end
    end
    commands
  end

  def self.command_description(category, action)
    descriptions = {
      media: {
        list: "List all media in library with folder structure",
        upload: "Upload a media file to the library",
        delete: "Delete a media file from the library"
      },
      dataset: {
        list: "List all datasets"
      },
      menuboard: {
        list: "List all menu boards",
        show: "Show details of a menu board with categories",
        create: "Create a new menu board"
      },
      category: {
        add: "Add a category to a menu board"
      },
      product: {
        add: "Add a product to a category",
        list: "List products in a category"
      }
    }
    descriptions.dig(category, action)
  end
end