require_relative '../base_command'
require_relative '../../image_manager'

module Commands
  module Media
    class UploadImageCommand < BaseCommand
      def execute
        image_manager = ImageManager.new(client)

        if options[:url]
          upload_from_url(image_manager)
        elsif options[:random]
          upload_random_image(image_manager)
        elsif options[:file]
          upload_file(image_manager)
        else
          raise "Must specify --url, --random, or --file"
        end
      rescue => e
        print_error("Upload failed: #{e.message}")
        raise if debug?
      end

      private

      def upload_from_url(image_manager)
        name = options[:name] || "image_#{Time.now.to_i}"
        temp_path = "temp/#{name}.jpg"

        print_info("Downloading image from #{options[:url]}")
        image_manager.download_from_url(options[:url], temp_path)

        print_info("Uploading to Xibo as '#{name}'")
        result = image_manager.upload_file(temp_path, name)

        print_success("Image uploaded successfully!")
        print_info("Media ID: #{result['mediaId']}")
        print_info("Name: #{result['name']}")
      end

      def upload_random_image(image_manager)
        name = options[:name] || "random_image_#{Time.now.to_i}"
        size = options[:size] || 800

        print_info("Downloading random #{size}x#{size} image")
        print_info("Uploading to Xibo as '#{name}'")

        result = image_manager.download_and_upload_random(name, size)

        print_success("Random image uploaded successfully!")
        print_info("Media ID: #{result['mediaId']}")
        print_info("Name: #{result['name']}")
      end

      def upload_file(image_manager)
        file_path = options[:file]
        name = options[:name] || File.basename(file_path, File.extname(file_path))

        print_info("Uploading #{file_path} to Xibo as '#{name}'")

        result = image_manager.upload_file(file_path, name)

        print_success("File uploaded successfully!")
        print_info("Media ID: #{result['mediaId']}")
        print_info("Name: #{result['name']}")
      end
    end
  end
end