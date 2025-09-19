require_relative '../base_command'

module Commands
  module Layout
    class StatusCommand < BaseCommand
      def execute
        layout_id = options[:id]

        if !layout_id
          # Show all layouts and their basic info
          layouts = client.get('/layout')
          puts "📄 All Layouts:"
          layouts.each do |layout|
            puts "  ID: #{layout['layoutId']}, Name: #{layout['layout']}, Status: #{layout['status'] || 'Unknown'}"
          end
          puts "\nUse -i ID to get detailed status for a specific layout"
          return
        end

        puts "🔍 Checking status for layout ID: #{layout_id}"

        # Get detailed layout status
        status_info = client.get("/layout/status/#{layout_id}")

        puts "\n📋 Layout Status Details:"
        puts "  Name: #{status_info['layout']}"
        puts "  Description: #{status_info['description']}"
        puts "  Status: #{status_info['status']}"
        puts "  Status Message: #{status_info['statusMessage']}" if status_info['statusMessage']
        puts "  Published: #{status_info['publishedDate'] || 'Not published'}"
        puts "  Modified: #{status_info['modifiedDate']}"
        puts "  Duration: #{status_info['duration']} seconds" if status_info['duration']

        # Check if there are validation issues
        if status_info['status'] && status_info['status'] != 'Valid'
          puts "\n❌ Issues found:"
          puts "  Status: #{status_info['status']}"
          puts "  Message: #{status_info['statusMessage']}" if status_info['statusMessage']

          # Try to get more detailed info
          if status_info['regions']
            puts "\n🏗️ Regions:"
            status_info['regions'].each_with_index do |region, i|
              puts "    Region #{i+1}: #{region['name'] || 'Unnamed'}"
              puts "      Duration: #{region['duration']} seconds" if region['duration']
              if region['playlists']
                region['playlists'].each do |playlist|
                  puts "      Playlist: #{playlist['name'] || 'Unnamed'} (#{playlist['widgets']&.length || 0} widgets)"
                end
              end
            end
          end
        else
          puts "\n✅ Layout appears to be valid"
        end

        if options[:json]
          puts "\n📄 Full JSON Response:"
          puts JSON.pretty_generate(status_info)
        end

        status_info
      rescue => e
        print_error("Failed to get layout status: #{e.message}")
        raise if debug?
      end
    end
  end
end