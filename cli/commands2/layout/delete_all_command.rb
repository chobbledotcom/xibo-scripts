require_relative '../base_command'

module Commands
  module Layout
    class DeleteAllCommand < BaseCommand
      def self.description
        "Delete all layouts except default"
      end
      def execute
        puts "⚠️  WARNING: This will delete ALL layouts except the Default Layout"
        
        unless options[:force]
          print "Are you sure? Type 'yes' to confirm: "
          confirmation = STDIN.gets.chomp
          unless confirmation.downcase == 'yes'
            puts "Cancelled"
            return
          end
        end

        layouts = client.request('/layout')
        
        # Filter out the default layout (ID 1) and any system layouts
        deletable = layouts.select { |l| 
          l['layoutId'] != 1 && 
          l['layout'] != 'Default Layout' &&
          !l['layout'].downcase.include?('default')
        }

        if deletable.empty?
          puts "No layouts to delete"
          return
        end

        puts "\n🗑️  Deleting #{deletable.length} layouts..."
        
        deleted = 0
        failed = 0
        
        deletable.each do |layout|
          begin
            print "  Deleting layout #{layout['layoutId']}: #{layout['layout']}... "
            client.request("/layout/#{layout['layoutId']}")
            puts "✓"
            deleted += 1
          rescue => e
            puts "✗ (#{e.message.split(':').last.strip})"
            failed += 1
          end
        end

        puts "\n📊 Summary:"
        puts "  Deleted: #{deleted}"
        puts "  Failed: #{failed}" if failed > 0
        
      rescue => e
        print_error("Failed to delete layouts: #{e.message}")
        raise if debug?
      end
    end
  end
end