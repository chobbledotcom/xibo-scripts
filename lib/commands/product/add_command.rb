require_relative '../base_command'
require_relative '../../crud_operations'
require 'json'

module Commands
  module Product
    class AddCommand < BaseCommand
      include CrudOperations

      def self.description
        "Add a product to a category"
      end

      def execute
        category_id = options[:category_id]

        unless category_id
          print_error("Category ID is required. Use --category-id")
          return
        end

        # If name is provided via CLI, use it
        if options[:name]
          create_from_options(category_id)
        else
          # Interactive mode
          interactive_create(:product, parent_id: category_id)
        end
      rescue => e
        print_error("Failed to add product: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def create_from_options(category_id)
        # Build attributes from options - use internal names
        attributes = {
          name: options[:name],
          description: options[:description],
          price: options[:price],
          available: options[:available],
          allergy_info: options[:allergy_info],
          code: options[:code],
          calories: options[:calories]
        }.compact

        result = create_entity(
          :product,
          attributes,
          parent_id: category_id
        )

        print_info("Product ID: #{result['menuProductId']}")

        if options[:json]
          puts JSON.pretty_generate(result)
        end

        result
      end
    end
  end
end
