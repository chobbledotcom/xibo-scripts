require 'json'
require 'fileutils'

class XiboCacheService
  # Use shared cache directory from CLI app
  XIBO_ROOT = File.expand_path('../../..', __dir__)
  CACHE_DIR = File.join(XIBO_ROOT, 'tmp', 'cache')
  CACHE_DURATION = nil # Cache is always valid since CLI is only client
  
  class << self
    def menuboards
      cache_key = 'menuboards'
      cached_data = read_cache(cache_key)
      
      if cached_data
        cached_data
      else
        fetch_and_cache_menuboards
      end
    rescue => e
      Rails.logger.error("Failed to fetch menuboards: #{e.message}")
      []
    end
    
    def refresh_menuboards
      fetch_and_cache_menuboards
    rescue => e
      Rails.logger.error("Failed to refresh menuboards: #{e.message}")
      []
    end
    
    def invalidate(cache_key)
      cache_file = cache_path(cache_key)
      File.delete(cache_file) if File.exist?(cache_file)
    end
    
    def invalidate_all
      FileUtils.rm_rf(CACHE_DIR) if Dir.exist?(CACHE_DIR)
      FileUtils.mkdir_p(CACHE_DIR)
    end
    
    private
    
    def fetch_and_cache_menuboards
      result = XiboCommandRunner.run('menuboard:list', { json: true })
      
      if result[:success] && result[:stdout].present?
        begin
          menuboards = JSON.parse(result[:stdout])
          write_cache('menuboards', menuboards)
          menuboards
        rescue JSON::ParserError => e
          Rails.logger.error("Failed to parse menuboards JSON: #{e.message}")
          Rails.logger.error("Raw output: #{result[:stdout].inspect}")
          []
        end
      else
        Rails.logger.error("Command failed or no output. Exit code: #{result[:exit_code]}, stderr: #{result[:stderr]}")
        []
      end
    end
    
    def read_cache(cache_key)
      cache_file = cache_path(cache_key)
      
      return nil unless File.exist?(cache_file)
      
      # No expiration check - cache is always valid
      # since CLI invalidates cache on changes
      
      JSON.parse(File.read(cache_file))
    rescue JSON::ParserError => e
      Rails.logger.error("Failed to parse cache file #{cache_key}: #{e.message}")
      File.delete(cache_file) if File.exist?(cache_file)
      nil
    end
    
    def write_cache(cache_key, data)
      FileUtils.mkdir_p(CACHE_DIR)
      cache_file = cache_path(cache_key)
      
      File.write(cache_file, JSON.pretty_generate(data))
    rescue => e
      Rails.logger.error("Failed to write cache file #{cache_key}: #{e.message}")
    end
    
    def cache_path(cache_key)
      CACHE_DIR.join("#{cache_key}.json")
    end
  end
end
