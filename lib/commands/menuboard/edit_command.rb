require_relative '../base_command'
require_relative '../../seed_data_manager'
require_relative '../../interactive_editor'
require 'json'

module Commands
  module Menuboard
    class EditCommand < BaseCommand
      include InteractiveEditor

      def self.description
        "Interactively edit a menu board and its contents"
      end

      def initialize(client, options = {})
        super
        @seed_manager = SeedDataManager.new
      end

      def execute
        print_info("Fetching menu boards from Xibo...")
        boards = client.request('/menuboards')

        if boards.empty?
          print_error("No menu boards found")
          return
        end

        selected_board = select_menu_board(boards)
        return unless selected_board

        edit_menu_loop(selected_board)
      rescue => e
        print_error("Failed to edit menu board: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def edit_menu_loop(board)
        loop do
          choice = show_menu(
            "Editing: #{board['name']} (ID: #{board['menuId']})",
            items: [
              "Board details (name, code, description)",
              "Categories",
              "Products",
              "Exit"
            ]
          )

          case choice
          when 1 then edit_board_details(board)
          when 2 then edit_categories(board)
          when 3 then edit_products(board)
          when 4
            print_info("Exiting editor")
            break
          else
            puts "Invalid option. Please try again."
          end
        end
      end

      def edit_board_details(board)
        puts "\n--- Edit Board Details ---"
        display_entity(board, ['menuId', 'name', 'code', 'description'])

        changes = collect_field_changes(board, [
          { name: 'name' },
          { name: 'code' },
          { name: 'description' }
        ])

        return print_info("No changes made") if changes.empty?

        return unless confirm_changes(changes, board)

        # Update in Xibo
        print_info("\nUpdating menu board in Xibo...")
        client.request("/menuboard/#{board['menuId']}", body: changes.transform_keys(&:to_sym))
        print_success("Updated in Xibo (ID: #{board['menuId']})")

        # Update seed data
        print_info("Updating seed data file...")
        filename = @seed_manager.update_board(board['name'], changes)
        print_success("Updated #{filename}")

        # Update local board object
        board.merge!(changes)
        print_success("Menu board updated successfully!")
      end

      def edit_categories(board)
        print_info("\nFetching categories...")
        categories = client.request("/menuboard/#{board['menuId']}/categories")

        if categories.empty?
          print_error("No categories found for this menu board")
          return
        end

        selected_category = select_from_list(
          categories,
          title: "Categories",
          display_field: 'name',
          id_field: 'menuCategoryId'
        )

        return unless selected_category

        edit_category_details(selected_category)
      end

      def edit_category_details(category)
        puts "\n--- Edit Category ---"
        display_entity(category, ['menuCategoryId', 'name', 'code', 'description'])

        changes = collect_field_changes(category, [
          { name: 'name' },
          { name: 'code' },
          { name: 'description' }
        ])

        return print_info("No changes made") if changes.empty?

        return unless confirm_changes(changes, category)

        # Update in Xibo
        print_info("\nUpdating category in Xibo...")
        client.request("/menuboard/#{category['menuCategoryId']}/category", body: changes.transform_keys(&:to_sym))
        print_success("Updated in Xibo (ID: #{category['menuCategoryId']})")

        # Update seed data
        print_info("Updating seed data file...")
        filename = @seed_manager.update_category(category['name'], changes)
        print_success("Updated #{filename}")

        print_success("Category updated successfully!")
      end

      def edit_products(board)
        print_info("\nFetching categories...")
        categories = client.request("/menuboard/#{board['menuId']}/categories")

        if categories.empty?
          print_error("No categories found for this menu board")
          return
        end

        selected_category = select_from_list(
          categories,
          title: "Select Category",
          display_field: 'name'
        )

        return unless selected_category

        # Fetch products
        print_info("\nFetching products...")
        products = client.request("/menuboard/#{selected_category['menuCategoryId']}/products")

        if products.empty?
          print_error("No products found in this category")
          return
        end

        selected_product = select_from_list(
          products,
          title: "Products in #{selected_category['name']}",
          display_field: 'name',
          id_field: 'menuProductId'
        )

        return unless selected_product

        edit_product_details(selected_product, selected_category['name'])
      end

      def edit_product_details(product, category_name)
        puts "\n--- Edit Product ---"
        display_entity(product, [
          'menuProductId', 'name', 'description', 'price',
          'calories', 'allergyInfo', 'code', 'availability'
        ])

        changes = collect_field_changes(product, [
          { name: 'name' },
          { name: 'description' },
          { name: 'price', type: :float },
          { name: 'calories', type: :integer },
          { name: 'allergyInfo' },
          { name: 'code' },
          { name: 'availability', type: :boolean, prompt: "Available? (y/n, or press Enter to keep '#{product['availability'] == 1 ? 'Yes' : 'No'}'): " }
        ])

        return print_info("No changes made") if changes.empty?

        return unless confirm_changes(changes, product)

        # Update in Xibo
        print_info("\nUpdating product in Xibo...")
        client.request("/menuboard/#{product['menuProductId']}/product", body: changes.transform_keys(&:to_sym))
        print_success("Updated in Xibo (ID: #{product['menuProductId']})")

        # Update seed data
        print_info("Updating seed data file...")
        filename = @seed_manager.update_product(category_name, product['name'], changes)
        print_success("Updated #{filename}")

        print_success("Product updated successfully!")
      end

      def select_menu_board(boards)
        # If ID is provided via option, use it
        if options[:id]
          board = boards.find { |b| b['menuId'] == options[:id].to_i }
          unless board
            print_error("Menu board with ID #{options[:id]} not found")
            return nil
          end
          return board
        end

        # Interactive selection
        select_from_list(
          boards,
          title: "Available Menu Boards",
          display_field: 'name',
          id_field: 'menuId',
          allow_cancel: false
        )
      end

      def display_entity(entity, fields)
        fields.each do |field|
          label = field.to_s.split('_').map(&:capitalize).join(' ')
          value = entity[field]

          # Format value
          if field == 'availability'
            value = value == 1 ? 'Yes' : 'No'
          elsif field == 'price' && value
            value = "$#{value}"
          elsif value.nil? || value == ''
            value = '(none)'
          end

          # Adjust label width for alignment
          puts "  #{label.ljust(15)}: #{value}"
        end
        puts ""
      end
    end
  end
end
