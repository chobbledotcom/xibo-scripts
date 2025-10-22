require_relative '../base_command'
require_relative '../../crud_operations'
require 'json'

module Commands
  module Menuboard
    class CreateCommand < BaseCommand
      include CrudOperations

      def self.description
        "Create a new menu board"
      end

      def execute
        # If name is provided via CLI, use it
        if options[:name]
          create_from_options
        else
          # Interactive mode
          interactive_create(:board)
        end
      rescue => e
        print_error("Failed to create menu board: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def create_from_options
        attributes = {
          name: options[:name],
          description: options[:description],
          code: options[:code]
        }.compact

        result = create_entity(:board, attributes, update_seeds: true)

        if options[:json]
          puts JSON.pretty_generate(result)
        else
          puts "\nCreated: #{result['name']} (ID: #{result['menuId']})"
        end

        result
      end
    end
  end
end
