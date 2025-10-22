require_relative '../base_command'
require_relative '../../crud_operations'

module Commands
  module Category
    class DeleteCommand < BaseCommand
      include CrudOperations

      def self.description
        "Delete a category"
      end

      def execute
        # Fetch menu board first to get categories
        menu_id = options[:menu_id]

        unless menu_id
          print_error("Menu board ID is required. Use --menu-id")
          return
        end

        if options[:id]
          # Delete specific category by ID
          delete_by_id(options[:id].to_i)
        else
          # Interactive selection
          interactive_delete_category(menu_id)
        end
      rescue => e
        print_error("Failed to delete category: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def delete_by_id(category_id)
        # Fetch category details (would need to get from board categories)
        # For now, we'll require the name via option or fetch from board
        print_error("Interactive mode required for category deletion")
        print_info("Run without --id option to select interactively")
      end

      def interactive_delete_category(menu_id)
        print_info("Fetching categories for menu board #{menu_id}...")
        categories = client.get("/menuboard/#{menu_id}/categories")

        interactive_delete(:category, categories, force: options[:force])
      end
    end
  end
end
