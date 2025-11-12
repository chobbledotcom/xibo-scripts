require_relative '../base_command'
require 'terminal-table'
require 'colorize'

module Commands
  module Menuboard
    class ShowCommand < BaseCommand
      def execute
        menu_id = options[:id]
        raise "Menu board ID required (use -i ID)" unless menu_id

        # Fetch menu board details
        board = client.request("/menuboard/#{menu_id}")

        # Fetch categories for this board
        categories = client.request("/menuboard/#{menu_id}/categories")

        if options[:json]
          output = {
            board: board,
            categories: categories
          }
          puts JSON.pretty_generate(output)
        else
          display_board(board)
          display_categories(categories)
        end
      rescue => e
        print_error("Failed to fetch menu board: #{e.message}")
        raise if debug?
      end

      private

      def display_board(board)
        puts "\n#{'Menu Board Details'.colorize(:green).bold}"
        puts "=" * 50
        puts "ID:          #{board['menuId']}"
        puts "Name:        #{board['name']}"
        puts "Code:        #{board['code'] || 'N/A'}"
        puts "Description: #{board['description'] || 'N/A'}"
        puts "Created:     #{board['createdDt']}"
        puts "Modified:    #{board['modifiedDt']}"
      end

      def display_categories(categories)
        return if categories.empty?

        puts "\n#{'Categories'.colorize(:yellow).bold}"
        puts "-" * 50

        categories.each do |category|
          puts "\n📁 #{category['name'].colorize(:cyan)} (ID: #{category['menuCategoryId']})"

          if category['products'] && !category['products'].empty?
            category['products'].each do |product|
              price = product['price'] ? "$#{product['price']}" : 'N/A'
              availability = product['availability'] == 1 ? '✓'.colorize(:green) : '✗'.colorize(:red)
              puts "    📦 #{product['name']} - #{price} [#{availability}]"
              puts "       #{product['description']}" if product['description'] && verbose?
            end
          else
            puts "    (No products)"
          end
        end
      end
    end
  end
end