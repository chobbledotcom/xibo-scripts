require_relative '../base_command'

module Commands
  module Media
    class UploadCommand < BaseCommand
      def execute
        file_path = options[:file]
        name = options[:name] || File.basename(file_path)
        folder_id = options[:folder_id]

        validate_file!(file_path)

        print_info("Uploading: #{file_path}")
        print_info("Name: #{name}")
        print_info("Folder ID: #{folder_id || 'root'}") if verbose?

        params = {
          name: name,
          folderId: folder_id
        }.compact

        result = client.post_multipart('/library', file_path, additional_params: params)

        print_success("Media uploaded successfully!")
        print_info("Media ID: #{result['mediaId']}") if result['mediaId']

        result
      rescue => e
        print_error("Upload failed: #{e.message}")
        raise
      end

      private

      def validate_file!(file_path)
        raise "No file specified" unless file_path
        raise "File not found: #{file_path}" unless File.exist?(file_path)
        raise "Path is a directory: #{file_path}" if File.directory?(file_path)
      end
    end
  end
end