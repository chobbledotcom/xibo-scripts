require_relative '../base_command'
require 'terminal-table'
require 'colorize'

module Commands
  module Menuboard
    class ListCommand < BaseCommand
      def execute
        params = build_params
        boards = client.request('/menuboards', params: params)

        if boards.empty?
          print_info("No menu boards found")
          return
        end

        if options[:json]
          puts JSON.pretty_generate(boards)
        else
          display_table(boards)
        end
      rescue => e
        print_error("Failed to fetch menu boards: #{e.message}")
        raise if debug?
      end

      private

      def build_params
        params = {}
        params[:menuId] = options[:id] if options[:id]
        params[:name] = options[:name] if options[:name]
        params[:code] = options[:code] if options[:code]
        params[:folderId] = options[:folder_id] if options[:folder_id]
        params
      end

      def display_table(boards)
        rows = boards.map do |board|
          [
            board['menuId'],
            board['name'] || 'N/A',
            board['code'] || 'N/A',
            board['description']&.slice(0, 30) || 'N/A',
            board['createdDt'] || 'N/A'
          ]
        end

        table = Terminal::Table.new(
          title: "Menu Boards".colorize(:green).bold,
          headings: ['ID', 'Name', 'Code', 'Description', 'Created'].map { |h| h.colorize(:yellow) },
          rows: rows,
          style: { border_top: false, border_bottom: false, border_left: false, border_right: false }
        )

        puts table
        puts "\nTotal: #{boards.length} menu board(s)".colorize(:cyan)
      end
    end
  end
end