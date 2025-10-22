require_relative '../base_command'
require 'json'
require 'io/console'

module Commands
  module Menuboard
    class EditCommand < BaseCommand
      def self.description
        "Interactively edit a menu board and its contents"
      end

      def execute
        # Step 1: List all menu boards
        print_info("Fetching menu boards from Xibo...")
        boards = client.get('/menuboards')

        if boards.empty?
          print_error("No menu boards found")
          return
        end

        # Step 2: Display and select a menu board
        selected_board = select_menu_board(boards)
        return unless selected_board

        # Step 3: Enter main editing loop
        edit_menu_loop(selected_board)

      rescue => e
        print_error("Failed to edit menu board: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def edit_menu_loop(board)
        loop do
          puts "\n" + "=" * 60
          puts "Editing: #{board['name']} (ID: #{board['menuId']})"
          puts "=" * 60
          puts "\nWhat would you like to edit?"
          puts "  1. Board details (name, code, description)"
          puts "  2. Categories"
          puts "  3. Products"
          puts "  4. Exit"
          puts ""

          print "Select option (1-4): "
          choice = STDIN.gets.chomp

          case choice
          when '1'
            edit_board_details(board)
          when '2'
            edit_categories(board)
          when '3'
            edit_products(board)
          when '4'
            print_info("Exiting editor")
            break
          else
            puts "Invalid option. Please try again."
          end
        end
      end

      def edit_board_details(board)
        puts "\n--- Edit Board Details ---"
        puts "  ID:          #{board['menuId']}"
        puts "  Name:        #{board['name']}"
        puts "  Code:        #{board['code'] || '(none)'}"
        puts "  Description: #{board['description'] || '(none)'}"
        puts ""

        # Prompt for new values
        new_values = prompt_for_board_edits(board)

        # Check if anything changed
        if new_values.empty?
          print_info("No changes made")
          return
        end

        # Confirm changes
        puts "\nChanges to be saved:"
        new_values.each do |key, value|
          puts "  #{key}: #{board[key] || '(none)'} → #{value}"
        end

        print "\nSave these changes? (y/n): "
        confirmation = STDIN.gets.chomp.downcase

        unless confirmation == 'y' || confirmation == 'yes'
          print_info("Edit cancelled")
          return
        end

        # Update in Xibo
        print_info("\nUpdating menu board in Xibo...")
        update_board_in_xibo(board['menuId'], new_values)

        # Update seed data
        print_info("Updating seed data file...")
        update_board_seed_data(board['name'], new_values)

        # Update the board object for display
        board.merge!(new_values)

        print_success("Menu board updated successfully!")
      end

      def edit_categories(board)
        # Fetch categories for this board
        print_info("\nFetching categories...")
        categories = client.get("/menuboard/#{board['menuId']}/categories")

        if categories.empty?
          print_error("No categories found for this menu board")
          return
        end

        # Display categories
        puts "\n--- Categories ---"
        categories.each_with_index do |cat, idx|
          code_display = cat['code'] ? " [#{cat['code']}]" : ""
          desc_display = cat['description'] ? " - #{cat['description']}" : ""
          puts "#{idx + 1}. #{cat['name']}#{code_display}#{desc_display} (ID: #{cat['menuCategoryId']})"
        end
        puts ""

        print "Select category number to edit (or 0 to cancel): "
        choice = STDIN.gets.chomp.to_i

        if choice == 0 || choice > categories.length
          return
        end

        selected_category = categories[choice - 1]
        edit_category_details(selected_category)
      end

      def edit_category_details(category)
        puts "\n--- Edit Category ---"
        puts "  ID:          #{category['menuCategoryId']}"
        puts "  Name:        #{category['name']}"
        puts "  Code:        #{category['code'] || '(none)'}"
        puts "  Description: #{category['description'] || '(none)'}"
        puts ""

        # Prompt for new values
        new_values = {}

        print "New name (or press Enter to keep '#{category['name']}'): "
        name = STDIN.gets.chomp
        new_values['name'] = name unless name.empty?

        current_code = category['code'] || '(none)'
        print "New code (or press Enter to keep '#{current_code}'): "
        code = STDIN.gets.chomp
        new_values['code'] = code unless code.empty?

        current_desc = category['description'] || '(none)'
        print "New description (or press Enter to keep '#{current_desc}'): "
        description = STDIN.gets.chomp
        new_values['description'] = description unless description.empty?

        if new_values.empty?
          print_info("No changes made")
          return
        end

        # Confirm changes
        puts "\nChanges to be saved:"
        new_values.each do |key, value|
          puts "  #{key}: #{category[key] || '(none)'} → #{value}"
        end

        print "\nSave these changes? (y/n): "
        confirmation = STDIN.gets.chomp.downcase

        unless confirmation == 'y' || confirmation == 'yes'
          print_info("Edit cancelled")
          return
        end

        # Update in Xibo
        print_info("\nUpdating category in Xibo...")
        update_category_in_xibo(category['menuCategoryId'], new_values)

        # Update seed data
        print_info("Updating seed data file...")
        update_category_seed_data(category['name'], new_values)

        print_success("Category updated successfully!")
      end

      def edit_products(board)
        # Fetch categories first
        print_info("\nFetching categories...")
        categories = client.get("/menuboard/#{board['menuId']}/categories")

        if categories.empty?
          print_error("No categories found for this menu board")
          return
        end

        # Display categories to select from
        puts "\n--- Select Category ---"
        categories.each_with_index do |cat, idx|
          puts "#{idx + 1}. #{cat['name']}"
        end
        puts ""

        print "Select category number (or 0 to cancel): "
        choice = STDIN.gets.chomp.to_i

        if choice == 0 || choice > categories.length
          return
        end

        selected_category = categories[choice - 1]

        # Fetch products for this category
        print_info("\nFetching products...")
        products = client.get("/menuboard/#{selected_category['menuCategoryId']}/products")

        if products.empty?
          print_error("No products found in this category")
          return
        end

        # Display products
        puts "\n--- Products in #{selected_category['name']} ---"
        products.each_with_index do |prod, idx|
          price_display = prod['price'] ? " - $#{prod['price']}" : ""
          avail_display = prod['availability'] == 0 ? " [UNAVAILABLE]" : ""
          puts "#{idx + 1}. #{prod['name']}#{price_display}#{avail_display} (ID: #{prod['menuProductId']})"
        end
        puts ""

        print "Select product number to edit (or 0 to cancel): "
        choice = STDIN.gets.chomp.to_i

        if choice == 0 || choice > products.length
          return
        end

        selected_product = products[choice - 1]
        edit_product_details(selected_product, selected_category['name'])
      end

      def edit_product_details(product, category_name)
        puts "\n--- Edit Product ---"
        puts "  ID:           #{product['menuProductId']}"
        puts "  Name:         #{product['name']}"
        puts "  Description:  #{product['description'] || '(none)'}"
        puts "  Price:        #{product['price'] ? "$#{product['price']}" : '(none)'}"
        puts "  Calories:     #{product['calories'] || '(none)'}"
        puts "  Allergy Info: #{product['allergyInfo'] || '(none)'}"
        puts "  Code:         #{product['code'] || '(none)'}"
        puts "  Available:    #{product['availability'] == 1 ? 'Yes' : 'No'}"
        puts ""

        # Prompt for new values
        new_values = {}

        print "New name (or press Enter to keep '#{product['name']}'): "
        name = STDIN.gets.chomp
        new_values['name'] = name unless name.empty?

        current_desc = product['description'] || '(none)'
        print "New description (or press Enter to keep '#{current_desc}'): "
        description = STDIN.gets.chomp
        new_values['description'] = description unless description.empty?

        current_price = product['price'] ? "$#{product['price']}" : '(none)'
        print "New price (or press Enter to keep '#{current_price}'): "
        price = STDIN.gets.chomp
        new_values['price'] = price.to_f unless price.empty?

        current_calories = product['calories'] || '(none)'
        print "New calories (or press Enter to keep '#{current_calories}'): "
        calories = STDIN.gets.chomp
        new_values['calories'] = calories.to_i unless calories.empty?

        current_allergy = product['allergyInfo'] || '(none)'
        print "New allergy info (or press Enter to keep '#{current_allergy}'): "
        allergy = STDIN.gets.chomp
        new_values['allergyInfo'] = allergy unless allergy.empty?

        current_code = product['code'] || '(none)'
        print "New code (or press Enter to keep '#{current_code}'): "
        code = STDIN.gets.chomp
        new_values['code'] = code unless code.empty?

        current_avail = product['availability'] == 1 ? 'Yes' : 'No'
        print "Available? (y/n, or press Enter to keep '#{current_avail}'): "
        avail = STDIN.gets.chomp.downcase
        new_values['availability'] = (avail == 'y' || avail == 'yes' ? 1 : 0) unless avail.empty?

        if new_values.empty?
          print_info("No changes made")
          return
        end

        # Confirm changes
        puts "\nChanges to be saved:"
        new_values.each do |key, value|
          old_value = product[key]
          if key == 'price'
            old_value = old_value ? "$#{old_value}" : '(none)'
            value = "$#{value}"
          elsif key == 'availability'
            old_value = old_value == 1 ? 'Yes' : 'No'
            value = value == 1 ? 'Yes' : 'No'
          else
            old_value ||= '(none)'
          end
          puts "  #{key}: #{old_value} → #{value}"
        end

        print "\nSave these changes? (y/n): "
        confirmation = STDIN.gets.chomp.downcase

        unless confirmation == 'y' || confirmation == 'yes'
          print_info("Edit cancelled")
          return
        end

        # Update in Xibo
        print_info("\nUpdating product in Xibo...")
        update_product_in_xibo(product['menuProductId'], new_values)

        # Update seed data
        print_info("Updating seed data file...")
        update_product_seed_data(category_name, product['name'], new_values)

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
        puts "\n=== Available Menu Boards ==="
        boards.each_with_index do |board, idx|
          code_display = board['code'] ? " [#{board['code']}]" : ""
          desc_display = board['description'] ? " - #{board['description']}" : ""
          puts "#{idx + 1}. #{board['name']}#{code_display}#{desc_display} (ID: #{board['menuId']})"
        end
        puts ""

        loop do
          print "Select menu board number (1-#{boards.length}) or ID: "
          input = STDIN.gets.chomp

          # Try as index first (1-based)
          if input.to_i > 0 && input.to_i <= boards.length
            return boards[input.to_i - 1]
          end

          # Try as menu ID
          board = boards.find { |b| b['menuId'] == input.to_i }
          return board if board

          puts "Invalid selection. Please try again."
        end
      end

      def prompt_for_board_edits(board)
        changes = {}

        # Name
        print "New name (or press Enter to keep '#{board['name']}'): "
        name = STDIN.gets.chomp
        changes['name'] = name unless name.empty?

        # Code
        current_code = board['code'] || '(none)'
        print "New code (or press Enter to keep '#{current_code}'): "
        code = STDIN.gets.chomp
        changes['code'] = code unless code.empty?

        # Description
        current_desc = board['description'] || '(none)'
        print "New description (or press Enter to keep '#{current_desc}'): "
        description = STDIN.gets.chomp
        changes['description'] = description unless description.empty?

        changes
      end

      # Xibo update methods
      def update_board_in_xibo(menu_id, changes)
        body = changes.transform_keys(&:to_sym)
        result = client.post("/menuboard/#{menu_id}", body: body)
        print_success("Updated in Xibo (ID: #{menu_id})")
        result
      end

      def update_category_in_xibo(category_id, changes)
        body = changes.transform_keys(&:to_sym)
        result = client.post("/menuboard/#{category_id}/category", body: body)
        print_success("Updated in Xibo (ID: #{category_id})")
        result
      end

      def update_product_in_xibo(product_id, changes)
        body = changes.transform_keys(&:to_sym)
        result = client.put("/menuboard/#{product_id}/product", body: body)
        print_success("Updated in Xibo (ID: #{product_id})")
        result
      end

      # Seed data update methods
      def update_board_seed_data(original_name, changes)
        seed_file = File.join(Dir.pwd, 'seeds', 'menu_boards.json')

        unless File.exist?(seed_file)
          print_error("Seed file not found: #{seed_file}")
          return
        end

        seed_data = JSON.parse(File.read(seed_file))
        board = seed_data['boards'].find { |b| b['name'] == original_name }

        if board
          board['name'] = changes['name'] if changes['name']
          board['code'] = changes['code'] if changes['code']
          board['description'] = changes['description'] if changes['description']

          File.write(seed_file, JSON.pretty_generate(seed_data))
          print_success("Updated menu_boards.json")
        else
          print_error("Board '#{original_name}' not found in seed data")
        end
      end

      def update_category_seed_data(original_name, changes)
        seed_file = File.join(Dir.pwd, 'seeds', 'categories.json')

        unless File.exist?(seed_file)
          print_error("Seed file not found: #{seed_file}")
          return
        end

        seed_data = JSON.parse(File.read(seed_file))
        category = seed_data['categories'].find { |c| c['name'] == original_name }

        if category
          category['name'] = changes['name'] if changes['name']
          category['code'] = changes['code'] if changes['code']
          category['description'] = changes['description'] if changes['description']

          File.write(seed_file, JSON.pretty_generate(seed_data))
          print_success("Updated categories.json")
        else
          print_error("Category '#{original_name}' not found in seed data")
        end
      end

      def update_product_seed_data(category_name, original_name, changes)
        seed_file = File.join(Dir.pwd, 'seeds', 'products.json')

        unless File.exist?(seed_file)
          print_error("Seed file not found: #{seed_file}")
          return
        end

        seed_data = JSON.parse(File.read(seed_file))

        # Products are organized by category name
        unless seed_data['products'][category_name]
          print_error("Category '#{category_name}' not found in products.json")
          return
        end

        product = seed_data['products'][category_name].find { |p| p['name'] == original_name }

        if product
          product['name'] = changes['name'] if changes['name']
          product['description'] = changes['description'] if changes['description']
          product['price'] = changes['price'] if changes['price']
          product['calories'] = changes['calories'] if changes['calories']
          product['allergyInfo'] = changes['allergyInfo'] if changes['allergyInfo']
          product['code'] = changes['code'] if changes['code']
          product['availability'] = changes['availability'] if changes.key?('availability')

          File.write(seed_file, JSON.pretty_generate(seed_data))
          print_success("Updated products.json")
        else
          print_error("Product '#{original_name}' not found in seed data")
        end
      end
    end
  end
end
