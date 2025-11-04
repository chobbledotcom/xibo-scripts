require_relative '../base_command'
require 'terminal-table'
require 'colorize'

module Commands
  module Category
    class ListCommand < BaseCommand
      def self.description
        "List all categories in a menu board"
      end

      def execute
        menu_id = options[:menu_id]

        unless menu_id
          print_error("Menu board ID is required. Use --menu-id")
          return
        end

        categories = client.request("/menuboard/#{menu_id}/categories")
        
        # Handle nil response
        categories = [] if categories.nil?

        if options[:json]
          puts JSON.pretty_generate(categories)
          return
        end

        if categories.empty?
          print_info("No categories found in menu board #{menu_id}")
          return
        end

        display_table(categories, menu_id)
      rescue => e
        print_error("Failed to fetch categories: #{e.message}")
        raise if debug?
      end

      private

      def display_table(categories, menu_id)
        rows = categories.map do |category|
          [
            category['menuCategoryId'],
            category['name'] || 'N/A',
            category['code'] || 'N/A',
            category['description']&.slice(0, 30) || 'N/A',
            category['menuProductAssignments']&.length || 0
          ]
        end

        table = Terminal::Table.new(
          title: "Categories (Menu Board: #{menu_id})".colorize(:green).bold,
          headings: ['ID', 'Name', 'Code', 'Description', 'Products'].map { |h| h.colorize(:yellow) },
          rows: rows,
          style: { border_top: false, border_bottom: false, border_left: false, border_right: false }
        )

        puts table
        puts "\nTotal: #{categories.length} category(ies)".colorize(:cyan)
      end
    end
  end
end
