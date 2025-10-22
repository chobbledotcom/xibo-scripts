require_relative '../base_command'
require 'json'
require 'io/console'

module Commands
  module Menuboard
    class EditCommand < BaseCommand
      def self.description
        "Interactively edit a menu board"
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

        # Step 3: Display current values and prompt for edits
        print_info("\nCurrent menu board details:")
        puts "  ID:          #{selected_board['menuId']}"
        puts "  Name:        #{selected_board['name']}"
        puts "  Code:        #{selected_board['code'] || '(none)'}"
        puts "  Description: #{selected_board['description'] || '(none)'}"
        puts ""

        # Step 4: Prompt for new values
        new_values = prompt_for_edits(selected_board)

        # Check if anything changed
        if new_values.empty?
          print_info("No changes made")
          return
        end

        # Confirm changes
        puts "\nChanges to be saved:"
        new_values.each do |key, value|
          puts "  #{key}: #{selected_board[key] || '(none)'} → #{value}"
        end

        print "\nSave these changes? (y/n): "
        confirmation = STDIN.gets.chomp.downcase

        unless confirmation == 'y' || confirmation == 'yes'
          print_info("Edit cancelled")
          return
        end

        # Step 5: Update in Xibo
        print_info("\nUpdating menu board in Xibo...")
        update_xibo(selected_board['menuId'], new_values)

        # Step 6: Update seed data
        print_info("Updating seed data file...")
        update_seed_data(selected_board['name'], new_values)

        print_success("Menu board updated successfully!")

        selected_board
      rescue => e
        print_error("Failed to edit menu board: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

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

      def prompt_for_edits(board)
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

      def update_xibo(menu_id, changes)
        # Prepare body with only changed fields
        body = changes.transform_keys(&:to_sym)

        result = client.post("/menuboard/#{menu_id}", body: body)
        print_success("Updated in Xibo (ID: #{menu_id})")
        result
      end

      def update_seed_data(original_name, changes)
        seed_file = File.join(Dir.pwd, 'seeds', 'menu_boards.json')

        unless File.exist?(seed_file)
          print_error("Seed file not found: #{seed_file}")
          return
        end

        # Read current seed data
        seed_data = JSON.parse(File.read(seed_file))

        # Find and update the board in seed data
        board = seed_data['boards'].find { |b| b['name'] == original_name }

        if board
          # Update with new values
          board['name'] = changes['name'] if changes['name']
          board['code'] = changes['code'] if changes['code']
          board['description'] = changes['description'] if changes['description']

          # Write back to file
          File.write(seed_file, JSON.pretty_generate(seed_data))
          print_success("Updated seed data file")
        else
          print_error("Board '#{original_name}' not found in seed data")
          print_info("You may need to add it manually to seeds/menu_boards.json")
        end
      end
    end
  end
end
