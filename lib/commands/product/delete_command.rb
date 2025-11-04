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

        print_info("Fetching products for category #{category_id}...")
        products = client.request("/menuboard/#{category_id}/products")

        interactive_delete(:product, products, force: options[:force])
      rescue => e
        print_error("Failed to delete product: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end
    end
  end
end
