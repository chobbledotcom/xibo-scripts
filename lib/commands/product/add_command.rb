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

        # Get category name for seed data
        category_name = find_category_name(category_id)

        # If name is provided via CLI, use it
        if options[:name]
          create_from_options(category_id, category_name)
        else
          # Interactive mode
          interactive_create(:product, parent_id: category_id, category_name: category_name)
        end
      rescue => e
        print_error("Failed to add product: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def create_from_options(category_id, category_name)
        attributes = {
          name: options[:name],
          description: options[:description],
          price: options[:price]&.to_f,
          availability: options[:available] == false ? 0 : 1,
          allergyInfo: options[:allergy_info],
          code: options[:code],
          calories: options[:calories]
        }.compact

        result = create_entity(
          :product,
          attributes,
          parent_id: category_id,
          category_name: category_name,
          update_seeds: true
        )

        print_info("Product ID: #{result['menuProductId']}")

        if options[:json]
          puts JSON.pretty_generate(result)
        end

        result
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
      rescue => e
        print_error("Could not determine category name: #{e.message}") if debug?
        nil
      end
    end
  end
end
