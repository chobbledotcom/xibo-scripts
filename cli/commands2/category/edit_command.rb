require_relative '../base_command'
require_relative '../../crud_operations'

module Commands
  module Category
    class EditCommand < BaseCommand
      include CrudOperations

      def self.description
        "Edit a category"
      end

      def execute
        category_id = options[:id]
        menu_id = options[:menu_id]

        unless category_id
          print_error("Category ID is required. Use --id")
          return
        end

        unless menu_id
          print_error("Menu ID is required. Use --menu-id")
          return
        end

        # Build update body
        updates = {}
        updates[:name] = options[:name] if options[:name]
        updates[:code] = options[:code] if options[:code]
        updates[:description] = options[:description] if options[:description]

        if updates.empty?
          print_error("No changes specified")
          return
        end

        print_info("Updating category #{category_id}...")
        result = client.request("/menuboard/#{category_id}/category", body: updates)

        print_success("Category updated successfully!")
        print_info("Category ID: #{result['menuCategoryId']}")

        if options[:json]
          puts JSON.pretty_generate(result)
        end

        result
      rescue => e
        print_error("Failed to update category: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end
    end
  end
end
