require_relative '../base_command'
require_relative '../../layout_builder'

module Commands
  module Layout
    class CreateCommand < BaseCommand
      def execute
        category_name = options[:category] || options[:name]
        menu_board_id = options[:menu_id]

        raise "Category name required (use -n or --category)" unless category_name
        raise "Menu board ID required (use --menu-id)" unless menu_board_id

        # Get products for this category
        products = get_category_products(category_name)

        if products.empty?
          print_info("No products found for category '#{category_name}'")
          print_info("Creating layout with empty grid")
        else
          print_info("Found #{products.length} products for '#{category_name}'")
        end

        # Create the layout
        layout_builder = LayoutBuilder.new(client)
        result = layout_builder.create_menu_layout(category_name, menu_board_id, products)

        print_success("Layout created successfully!")
        print_info("Layout ID: #{result[:layout]['layoutId']}")
        print_info("Layout Name: #{result[:layout]['layout']}")

        if options[:show_grid]
          LayoutBuilder.show_grid_layout
        end

        result
      rescue => e
        print_error("Failed to create layout: #{e.message}")
        raise if debug?
      end

      private

      def get_category_products(category_name)
        # First find the category ID
        boards = client.get('/menuboards')
        category_id = nil

        boards.each do |board|
          categories = client.get("/menuboard/#{board['menuId']}/categories")
          category = categories.find { |c| c['name'].downcase == category_name.downcase }
          if category
            category_id = category['menuCategoryId']
            break
          end
        end

        if category_id
          client.get("/menuboard/#{category_id}/products")
        else
          print_error("Category '#{category_name}' not found")
          []
        end
      rescue => e
        print_error("Could not fetch products: #{e.message}")
        []
      end
    end
  end
end