require_relative '../base_command'
require_relative '../../crud_operations'

module Commands
  module Product
    class DeleteCommand < BaseCommand
      include CrudOperations

      def self.description
        "Delete a product"
      end

      def execute
        # Require category ID to know which category's products to list
        category_id = options[:category_id]

        unless category_id
          print_error("Category ID is required. Use --category-id")
          return
        end

        # Get category name for seed data operations
        print_info("Fetching category details...")
        # We need to get the category name - this requires getting the board first
        # For now, we'll fetch products and handle this

        interactive_delete_product(category_id)
      rescue => e
        print_error("Failed to delete product: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def interactive_delete_product(category_id)
        print_info("Fetching products for category #{category_id}...")
        products = client.get("/menuboard/#{category_id}/products")

        # We need to get the category name for seed data
        # Let's fetch from all boards and find the category
        category_name = find_category_name(category_id)

        if category_name
          interactive_delete(:product, products, force: options[:force], category_name: category_name)
        else
          print_error("Could not determine category name. Deleting from Xibo only...")
          # Delete without seed update
          interactive_delete(:product, products, force: options[:force], update_seeds: false)
        end
      end

      def find_category_name(category_id)
        # Fetch all boards and search for the category
        boards = client.get('/menuboards')

        boards.each do |board|
          categories = client.get("/menuboard/#{board['menuId']}/categories")
          category = categories.find { |c| c['menuCategoryId'] == category_id.to_i }
          return category['name'] if category
        end

        nil
      rescue
        nil
      end
    end
  end
end
