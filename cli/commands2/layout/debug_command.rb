require_relative '../base_command'

module Commands
  module Layout
    class DebugCommand < BaseCommand
      def execute
        puts "🔍 Debugging layout creation process"

        # Check resolutions
        puts "\n📐 Available resolutions:"
        resolutions = client.request('/resolution')
        resolutions.each do |res|
          puts "  ID: #{res['resolutionId']}, #{res['resolution']}, #{res['width']}x#{res['height']}"
        end

        # Check layouts
        puts "\n📄 Existing layouts:"
        layouts = client.request('/layout')
        layouts.each do |layout|
          puts "  ID: #{layout['layoutId']}, #{layout['layout']}"
        end

        # Try to get layout details if any exist
        if !layouts.empty?
          layout_id = layouts.first['layoutId']
          puts "\n🔍 Layout #{layout_id} details:"
          layout_detail = client.request("/layout/#{layout_id}", params: { embed: 'regions,playlists' })
          puts "  Name: #{layout_detail['layout']}"
          puts "  Resolution: #{layout_detail['width']}x#{layout_detail['height']}"
          if layout_detail['regions']
            puts "  Regions: #{layout_detail['regions'].length}"
            layout_detail['regions'].each_with_index do |region, i|
              puts "    Region #{i+1}: ID #{region['regionId']}, #{region['width']}x#{region['height']}"
            end
          end
        end

      rescue => e
        print_error("Debug failed: #{e.message}")
        raise if debug?
      end
    end
  end
end