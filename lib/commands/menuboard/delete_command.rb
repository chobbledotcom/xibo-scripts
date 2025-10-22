require_relative '../base_command'
require_relative '../../crud_operations'

module Commands
  module Menuboard
    class DeleteCommand < BaseCommand
      include CrudOperations

      def self.description
        "Delete a menu board"
      end

      def execute
        if options[:id]
          # Delete specific board by ID
          delete_by_id
        else
          # Interactive selection
          interactive_delete_board
        end
      rescue => e
        print_error("Failed to delete menu board: #{e.message}")
        puts e.backtrace if debug?
        raise if debug?
      end

      private

      def delete_by_id
        board_id = options[:id].to_i

        # Fetch board details to get the name
        print_info("Fetching menu board details...")
        board = client.get("/menuboard/#{board_id}")

        delete_entity(
          :board,
          board['menuId'],
          board['name'],
          force: options[:force],
          update_seeds: true
        )
      end

      def interactive_delete_board
        print_info("Fetching menu boards...")
        boards = client.get('/menuboards')

        interactive_delete(:board, boards, force: options[:force])
      end
    end
  end
end
