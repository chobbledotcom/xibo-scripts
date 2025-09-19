require_relative '../base_command'

module Commands
  module Category
    class AddCommand < BaseCommand
      def execute
        # Client will automatically validate required params from swagger.json
        body = {
          name: options[:name],
          description: options[:description],
          code: options[:code]
        }.compact

        menu_id = options[:menu_id]

        print_info("Adding category '#{options[:name]}' to menu board #{menu_id}")

        result = client.post("/menuboard/#{menu_id}/category", body: body)

        print_success("Category added successfully!")
        print_info("Category ID: #{result['menuCategoryId']}")

        result
      rescue => e
        print_error("Failed to add category: #{e.message}")
        raise if debug?
      end
    end
  end
end