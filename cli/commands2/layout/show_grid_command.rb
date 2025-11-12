require_relative '../base_command'

module Commands
  module Layout
    class ShowGridCommand < BaseCommand
      def execute
        Xibo::LayoutBuilder.show_grid_layout
      end
    end
  end
end