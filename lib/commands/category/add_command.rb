require_relative '../base_command'
require_relative '../../crud_operations'

module Commands
  module Category
    class AddCommand < BaseCommand
      include CrudOperations

      def self.description
        "Add a category to a menu board"
      end

      def execute
        menu_id = options[:menu_id]

        unless menu_id
          print_error("Menu board ID is required. Use --menu-id")
          return
        end

        # If name is provided via CLI, use it
        if options[:name]
          create_from_options(menu_id)
        else
          # Interactive mode
          interactive_create(:category, parent_id: menu_id)
        end
      rescue => e
        print_error("Failed to add category: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def create_from_options(menu_id)
        attributes = {
          name: options[:name],
          description: options[:description],
          code: options[:code]
        }.compact

        result = create_entity(:category, attributes, parent_id: menu_id, update_seeds: true)

        print_info("Category ID: #{result['menuCategoryId']}")
        result
      end
    end
  end
end
