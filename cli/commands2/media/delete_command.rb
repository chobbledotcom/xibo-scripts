require_relative '../base_command'

module Commands
  module Media
    class DeleteCommand < BaseCommand
      def execute
        media_id = options[:id]
        force = options[:force]

        raise "No media ID specified" unless media_id

        unless force
          print("Are you sure you want to delete media ID #{media_id}? (y/N): ")
          response = STDIN.gets.chomp.downcase
          unless response == 'y'
            print_info("Deletion cancelled")
            return
          end
        end

        print_info("Deleting media ID: #{media_id}")

        client.request("/library/#{media_id}")

        print_success("Media deleted successfully!")
      rescue => e
        print_error("Deletion failed: #{e.message}")
        raise
      end
    end
  end
end