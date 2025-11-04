require_relative '../base_command'
require_relative '../../crud_operations'

module Commands
  module Product
    class EditCommand < BaseCommand
      include CrudOperations

      def self.description
        "Edit a product"
      end

      def execute
        product_id = options[:id]
        category_id = options[:category_id]

        unless product_id
          print_error("Product ID is required. Use --id")
          return
        end

        unless category_id
          print_error("Category ID is required. Use --category-id")
          return
        end

        # Get current product to use as defaults for required fields
        current_product = client.request("/menuboard/#{category_id}/products", method: :get)
          .find { |p| p['menuProductId'].to_s == product_id.to_s }
        
        unless current_product
          print_error("Product not found")
          return
        end

        # Build update body - name and displayOrder are required by API
        updates = {}
        updates[:name] = options[:name] || current_product['name']
        updates[:displayOrder] = current_product['displayOrder'] || 1
        updates[:description] = options[:description] if options[:description]
        updates[:price] = options[:price].to_f if options[:price]
        updates[:calories] = options[:calories].to_i if options[:calories]
        updates[:allergyInfo] = options[:allergy_info] if options[:allergy_info]
        updates[:code] = options[:code] if options[:code]
        
        # Handle availability - convert boolean to integer
        if options.key?(:available)
          updates[:availability] = options[:available] ? 1 : 0
        end

        print_info("Updating product #{product_id}...")
        result = client.request("/menuboard/#{product_id}/product", body: updates)

        print_success("Product updated successfully!")
        print_info("Product ID: #{result['menuProductId']}")

        if options[:json]
          puts JSON.pretty_generate(result)
        end

        result
      rescue => e
        print_error("Failed to update product: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end
    end
  end
end
