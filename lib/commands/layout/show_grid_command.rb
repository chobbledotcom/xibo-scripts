require_relative '../base_command'
require_relative '../../layout_builder'

module Commands
  module Layout
    class ShowGridCommand < BaseCommand
      def execute
        LayoutBuilder.show_grid_layout
      end
    end
  end
end