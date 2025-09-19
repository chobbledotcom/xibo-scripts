require 'net/http'
require 'fileutils'

class ImageManager
  def initialize(client, temp_dir = 'temp')
    @client = client
    @temp_dir = temp_dir
    FileUtils.mkdir_p(@temp_dir)
  end

  # Download a random image and upload to Xibo with given name
  def download_and_upload_random(name, size = 800)
    image_filename = "#{name.gsub(' ', '_')}.jpg"
    image_path = "#{@temp_dir}/#{image_filename}"

    download_random_image(image_path, size)
    upload_to_xibo(image_path, name)
  end

  # Try to find existing media by name, return nil if not found
  def find_existing_media(name)
    media_list = @client.get('/library')
    media_list.find { |media| media['name'] == name }
  rescue
    nil
  end

  # Upload an existing local file to Xibo
  def upload_file(file_path, name = nil)
    name ||= File.basename(file_path, File.extname(file_path))
    upload_to_xibo(file_path, name)
  end

  # Download a random image from picsum.photos
  def download_random_image(path, size = 800)
    uri = URI.parse("https://picsum.photos/#{size}")

    # Follow redirects to get the actual image
    response = Net::HTTP.get_response(uri)

    if response.code == '302' || response.code == '301'
      # Follow the redirect
      actual_uri = URI.parse(response['location'])
      response = Net::HTTP.get_response(actual_uri)
    end

    File.open(path, 'wb') do |file|
      file.write(response.body)
    end

    path
  end

  # Download image from specific URL
  def download_from_url(url, path)
    uri = URI.parse(url)
    response = Net::HTTP.get_response(uri)

    File.open(path, 'wb') do |file|
      file.write(response.body)
    end

    path
  end

  # Clean up temporary files
  def cleanup
    FileUtils.rm_rf(@temp_dir) if Dir.exist?(@temp_dir)
  end

  private

  def upload_to_xibo(file_path, name)
    # Ensure client is authenticated
    @client.authenticate! unless @client.authenticated?

    # If name conflicts, add timestamp
    attempt_name = name
    result = @client.post_multipart('/library', file_path, additional_params: { name: attempt_name })

    # Extract mediaId from the response structure
    if result['files'] && result['files'].first
      file_result = result['files'].first
      if file_result['error'] && file_result['error'].include?('already own media with this name')
        # Try once with timestamp suffix
        timestamp = Time.now.to_i
        attempt_name = "#{name}_#{timestamp}"
        result = @client.post_multipart('/library', file_path, additional_params: { name: attempt_name })
        file_result = result['files'].first
      end

      if file_result['error']
        raise "Upload failed: #{file_result['error']}"
      end

      { 'mediaId' => file_result['mediaId'], 'name' => file_result['name'] }
    else
      raise "Unexpected upload response format"
    end
  end
end