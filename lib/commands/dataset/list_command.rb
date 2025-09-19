require_relative '../base_command'

module Commands
  module Dataset
    class ListCommand < BaseCommand
      def execute
        datasets = client.get('/dataset')

        if datasets.empty?
          print_info("No datasets found")
          return
        end

        puts "Datasets:"
        puts "=" * 40

        datasets.each do |dataset|
          puts "📊 #{dataset['dataset']} - ID: #{dataset['dataSetId']}"
          puts "   Description: #{dataset['description']}" if dataset['description']
          puts "   Columns: #{dataset['countCols']}" if dataset['countCols']
          puts "   Rows: #{dataset['countRows']}" if dataset['countRows']
          puts ""
        end
      rescue => e
        print_error("Failed to fetch datasets: #{e.message}")
        raise
      end
    end
  end
end