require_relative '../base_command'
require 'json'

module Commands
  module Menuboard
    class CreateCommand < BaseCommand
      def execute
        # The client will automatically validate based on swagger.json
        body = {
          name: options[:name],
          description: options[:description],
          code: options[:code]
        }.compact

        print_info("Creating menu board: #{options[:name]}") if options[:name]

        result = client.post('/menuboard', body: body)

        print_success("Menu board created successfully!")
        print_info("Menu Board ID: #{result['menuId']}")

        if options[:json]
          puts JSON.pretty_generate(result)
        else
          puts "\nCreated: #{result['name']} (ID: #{result['menuId']})"
        end

        result
      rescue => e
        print_error("Failed to create menu board: #{e.message}")
        raise if debug?
      end
    end
  end
end