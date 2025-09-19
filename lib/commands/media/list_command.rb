require_relative '../base_command'

module Commands
  module Media
    class ListCommand < BaseCommand
      def execute
        folders = fetch_folders
        media_items = fetch_media

        print_tree(folders, media_items)
      end

      private

      def fetch_folders
        client.get('/folders')
      rescue => e
        print_error("Failed to fetch folders: #{e.message}")
        []
      end

      def fetch_media(folder_id = nil)
        params = folder_id ? { folderId: folder_id } : {}
        client.get('/library', params: params)
      rescue => e
        print_error("Failed to fetch media: #{e.message}")
        []
      end

      def print_tree(folders, media_items)
        puts "Media Library Structure:"
        puts "=" * 40

        folder_map = build_folder_map(folders)
        root_folders = find_root_folders(folders)

        # Display root level media
        print_media_items(media_items, nil, 0)

        # Display folders and their contents recursively
        root_folders.each do |folder|
          print_folder_tree(folder, folder_map, media_items, 0)
        end
      end

      def build_folder_map(folders)
        return {} unless folders.is_a?(Array)

        folders.each_with_object({}) do |folder, map|
          map[folder['folderId']] = folder
        end
      end

      def find_root_folders(folders)
        return [] unless folders.is_a?(Array)

        folders.select do |folder|
          folder['parentId'].nil? || folder['parentId'] == 0
        end
      end

      def print_media_items(all_media, folder_id, indent_level)
        return unless all_media.is_a?(Array)

        media_items = if folder_id
          all_media.select { |m| m['folderId'] == folder_id }
        else
          all_media.select { |m| m['folderId'].nil? || m['folderId'] == 0 }
        end

        media_items.each do |item|
          indent = "  " * indent_level
          type_emoji = get_media_type_emoji(item['mediaType'])
          puts "#{indent}#{type_emoji} #{item['name']} (#{item['mediaType']}) - ID: #{item['mediaId']}"
        end
      end

      def print_folder_tree(folder, folder_map, all_media, indent_level)
        indent = "  " * indent_level
        puts "#{indent}📁 #{folder['text']}"

        # Display media in this folder
        print_media_items(all_media, folder['folderId'], indent_level + 1)

        # Display subfolders
        folder_map.values.each do |subfolder|
          if subfolder['parentId'] == folder['folderId']
            print_folder_tree(subfolder, folder_map, all_media, indent_level + 1)
          end
        end
      end

      def get_media_type_emoji(media_type)
        case media_type&.downcase
        when 'image' then '🖼️'
        when 'video' then '🎬'
        when 'audio' then '🎵'
        when 'document', 'pdf' then '📄'
        when 'powerpoint' then '📊'
        when 'webpage' then '🌐'
        else '📄'
        end
      end
    end
  end
end