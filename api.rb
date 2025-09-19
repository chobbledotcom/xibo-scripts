#!/usr/bin/env ruby

require 'dotenv'
require 'httparty'
require 'json'
require 'optparse'
require 'uri'

Dotenv.load

class XiboAPI
  include HTTParty

  def initialize
    @base_url = ENV['XIBO_API_URL']
    @client_id = ENV['XIBO_CLIENT_ID']
    @client_secret = ENV['XIBO_CLIENT_SECRET']

    raise "Missing XIBO_API_URL in .env file" unless @base_url
    raise "Missing XIBO_CLIENT_ID in .env file" unless @client_id
    raise "Missing XIBO_CLIENT_SECRET in .env file" unless @client_secret

    @base_url = @base_url.chomp('/')
    @access_token = nil
  end

  def authenticate
    # Xibo CMS API v4 OAuth2 endpoint
    url = "#{@base_url}/api/authorize/access_token"

    puts "Authenticating with: #{url}" if ENV['DEBUG']
    puts "Client ID: #{@client_id[0..10]}..." if ENV['DEBUG']

    response = HTTParty.post(
      url,
      headers: {
        'Content-Type' => 'application/x-www-form-urlencoded'
      },
      body: URI.encode_www_form({
        grant_type: 'client_credentials',
        client_id: @client_id,
        client_secret: @client_secret
      })
    )

    if response.code == 200
      @access_token = response.parsed_response['access_token']
      puts "Successfully authenticated with Xibo API" if $VERBOSE
    else
      raise "Authentication failed: #{response.code} - #{response.body}"
    end
  end

  def get_media_folders(parent_id = nil)
    authenticate unless @access_token

    params = { folderId: parent_id }.compact

    response = HTTParty.get(
      "#{@base_url}/api/library",
      headers: {
        'Authorization' => "Bearer #{@access_token}"
      },
      query: params
    )

    if response.code == 200
      response.parsed_response
    else
      raise "Failed to fetch media: #{response.code} - #{response.body}"
    end
  end

  def get_folders
    authenticate unless @access_token

    response = HTTParty.get(
      "#{@base_url}/api/folders",
      headers: {
        'Authorization' => "Bearer #{@access_token}"
      }
    )

    if response.code == 200
      response.parsed_response
    else
      raise "Failed to fetch folders: #{response.code} - #{response.body}"
    end
  end

  def list_media_tree
    folders = get_folders
    media = get_media_folders

    puts "Media Library Structure:"
    puts "=" * 40

    # Build folder hierarchy
    folder_map = {}
    root_folders = []

    if folders && folders.is_a?(Array)
      folders.each do |folder|
        folder_map[folder['folderId']] = folder
        if folder['parentId'].nil? || folder['parentId'] == 0
          root_folders << folder
        end
      end
    end

    # Display root level media
    if media && media.is_a?(Array)
      root_media = media.select { |m| m['folderId'].nil? || m['folderId'] == 0 }
      root_media.each do |item|
        puts "📄 #{item['name']} (#{item['mediaType']}) - ID: #{item['mediaId']}"
      end
    end

    # Display folders and their contents recursively
    root_folders.each do |folder|
      display_folder_tree(folder, folder_map, media, 0)
    end
  end

  private

  def display_folder_tree(folder, folder_map, all_media, indent_level)
    indent = "  " * indent_level
    puts "#{indent}📁 #{folder['text']}"

    # Display media in this folder
    if all_media && all_media.is_a?(Array)
      folder_media = all_media.select { |m| m['folderId'] == folder['folderId'] }
      folder_media.each do |item|
        puts "#{indent}  📄 #{item['name']} (#{item['mediaType']}) - ID: #{item['mediaId']}"
      end
    end

    # Display subfolders
    folder_map.values.each do |subfolder|
      if subfolder['parentId'] == folder['folderId']
        display_folder_tree(subfolder, folder_map, all_media, indent_level + 1)
      end
    end
  end
end

# Parse command line options
options = {}
OptionParser.new do |opts|
  opts.banner = "Usage: api.rb [options]"

  opts.on("--list-media", "List media library tree structure") do
    options[:list_media] = true
  end

  opts.on("-h", "--help", "Prints this help") do
    puts opts
    exit
  end
end.parse!

# Main execution
if options[:list_media]
  begin
    api = XiboAPI.new
    api.list_media_tree
  rescue => e
    puts "Error: #{e.message}"
    exit 1
  end
else
  puts "Please specify an action. Use --help for available options."
  exit 1
end