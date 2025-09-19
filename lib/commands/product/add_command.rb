require_relative '../base_command'

module Commands
  module Product
    class AddCommand < BaseCommand
      def execute
        # Client will automatically validate against swagger.json
        body = {
          name: options[:name],
          description: options[:description],
          price: options[:price]&.to_f,
          availability: options[:available] == false ? 0 : 1,
          allergyInfo: options[:allergy_info],
          code: options[:code],
          calories: options[:calories]
        }.compact

        category_id = options[:category_id]

        print_info("Adding product '#{options[:name]}' to category #{category_id}")

        result = client.post("/menuboard/#{category_id}/product", body: body)

        print_success("Product added successfully!")
        print_info("Product ID: #{result['menuProductId']}")

        if options[:json]
          puts JSON.pretty_generate(result)
        end

        result
      rescue => e
        print_error("Failed to add product: #{e.message}")
        raise if debug?
      end
    end
  end
end