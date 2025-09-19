require_relative '../base_command'
require 'terminal-table'
require 'colorize'

module Commands
  module Product
    class ListCommand < BaseCommand
      def execute
        category_id = options[:category_id]

        # Swagger validation will ensure category_id is provided and valid
        products = client.get("/menuboard/#{category_id}/products")

        if products.empty?
          print_info("No products found in category #{category_id}")
          return
        end

        if options[:json]
          puts JSON.pretty_generate(products)
        else
          display_products_table(products)
        end
      rescue => e
        print_error("Failed to fetch products: #{e.message}")
        raise if debug?
      end

      private

      def display_products_table(products)
        rows = products.map do |product|
          availability = product['availability'] == 1 ? '✓'.colorize(:green) : '✗'.colorize(:red)
          price = product['price'] ? "$#{'%.2f' % product['price']}" : 'N/A'

          [
            product['menuProductId'],
            product['name'],
            price,
            availability,
            product['calories'] || 'N/A',
            product['description']&.slice(0, 30) || 'N/A'
          ]
        end

        table = Terminal::Table.new(
          title: "Products".colorize(:green).bold,
          headings: ['ID', 'Name', 'Price', 'Available', 'Calories', 'Description'].map { |h| h.colorize(:yellow) },
          rows: rows,
          style: { border_top: false, border_bottom: false, border_left: false, border_right: false }
        )

        puts table
        puts "\nTotal: #{products.length} product(s)".colorize(:cyan)
      end
    end
  end
end