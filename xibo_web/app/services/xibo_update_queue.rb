require 'json'
require 'fileutils'

class XiboUpdateQueue
  QUEUE_DIR = File.expand_path('../../../tmp/xibo-updates', __dir__)
  
  class << self
    def enqueue(method:, path:, body: {}, entity_type:, entity_id:)
      FileUtils.mkdir_p(QUEUE_DIR)
      
      timestamp = Time.now.strftime('%Y%m%d_%H%M%S_%N')
      filename = "#{timestamp}_#{method.upcase}_#{entity_type}_#{entity_id}.json"
      filepath = File.join(QUEUE_DIR, filename)
      
      data = {
        method: method.to_s.upcase,
        path: path,
        body: body,
        entity_type: entity_type,
        entity_id: entity_id,
        enqueued_at: Time.now.iso8601
      }
      
      File.write(filepath, JSON.pretty_generate(data))
      
      filepath
    end
    
    def pending_updates
      return [] unless Dir.exist?(QUEUE_DIR)
      
      Dir.glob(File.join(QUEUE_DIR, '*.json'))
         .reject { |f| f.end_with?('.failed') }
         .sort
         .map { |filepath| parse_update_file(filepath) }
         .compact
    end
    
    def failed_updates
      return [] unless Dir.exist?(QUEUE_DIR)
      
      Dir.glob(File.join(QUEUE_DIR, '*.failed'))
         .sort
         .map { |filepath| parse_update_file(filepath) }
         .compact
    end
    
    def all_updates
      pending_updates + failed_updates
    end
    
    def process_next
      pending = pending_updates.first
      return nil unless pending
      
      begin
        result = XiboCommandRunner.run_api_request(
          method: pending[:method],
          path: pending[:path],
          body: pending[:body]
        )
        
        if result[:success]
          # Delete the queue file on success
          File.delete(pending[:filepath])
          
          # Cache was already updated optimistically when queuing
          # No need to update again here
          
          { success: true, update: pending, result: result }
        else
          # Mark as failed and store reason (only if file still exists)
          if File.exist?(pending[:filepath])
            mark_as_failed(pending[:filepath], result[:error] || result[:response]&.to_s || 'Unknown error')
          end
          { success: false, update: pending, result: result }
        end
      rescue => e
        # Mark as failed and store reason
        mark_as_failed(pending[:filepath], e.message) if File.exist?(pending[:filepath])
        { success: false, update: pending, error: e.message }
      end
    end
    
    def retry_failed(filepath)
      return unless filepath.end_with?('.failed')
      
      # Remove .failed extension
      new_path = filepath.sub(/\.failed$/, '')
      File.rename(filepath, new_path) if File.exist?(filepath)
    end
    
    def delete_update(filepath)
      File.delete(filepath) if File.exist?(filepath)
    end
    
    private
    
    def mark_as_failed(filepath, reason)
      # Read the current data
      data = JSON.parse(File.read(filepath))
      
      # Add failure information
      data['failed_at'] = Time.now.iso8601
      data['failure_reason'] = reason
      data['retry_count'] = (data['retry_count'] || 0) + 1
      
      # Write updated data back
      File.write(filepath, JSON.pretty_generate(data))
      
      # Rename to .failed
      File.rename(filepath, "#{filepath}.failed")
    rescue => e
      Rails.logger.error("Failed to mark update as failed: #{e.message}")
      # Fallback: just rename
      File.rename(filepath, "#{filepath}.failed") if File.exist?(filepath)
    end
    
    def parse_update_file(filepath)
      data = JSON.parse(File.read(filepath), symbolize_names: true)
      data.merge(
        filepath: filepath,
        filename: File.basename(filepath),
        failed: filepath.end_with?('.failed')
      )
    rescue => e
      Rails.logger.error("Failed to parse update file #{filepath}: #{e.message}")
      nil
    end
    
    def find_category_for_product(product_id)
      tree = XiboCacheService.tree_data
      tree.each do |board|
        board['categories']&.each do |category|
          category['products']&.each do |product|
            return category['menuCategoryId'] if product['menuProductId'].to_s == product_id.to_s
          end
        end
      end
      nil
    end
  end
end
