require 'json'
require 'fileutils'

module Xibo
  # Cache service for storing and retrieving Xibo API data
  # Assumes cache is always accurate since this is the only client making changes
  class CacheService
  CACHE_DIR = File.join(__dir__, '..', 'tmp', 'cache')
  
  class << self
    # Get cached data or fetch from API
    # @param cache_key [String] Cache identifier
    # @param refresh [Boolean] Force refresh from API
    # @yield Block to fetch fresh data if cache miss
    # @return [Object] Cached or fresh data
    def fetch(cache_key, refresh: false, &block)
      if refresh
        data = block.call
        write_cache(cache_key, data)
        return data
      end
      
      cached_data = read_cache(cache_key)
      
      if cached_data
        cached_data
      else
        data = block.call
        write_cache(cache_key, data) if data
        data
      end
    end
    
    # Invalidate a specific cache entry
    # @param cache_key [String] Cache identifier
    def invalidate(cache_key)
      cache_file = cache_path(cache_key)
      if File.exist?(cache_file)
        File.delete(cache_file)
        puts "🗑️  Invalidated cache: #{cache_key}" if ENV['DEBUG'] || ENV['VERBOSE']
      end
    end
    
    # Invalidate all cache entries
    def invalidate_all
      FileUtils.rm_rf(CACHE_DIR) if Dir.exist?(CACHE_DIR)
      FileUtils.mkdir_p(CACHE_DIR)
    end
    
    # Read from cache without fetching
    # @param cache_key [String] Cache identifier
    # @return [Object, nil] Cached data or nil
    def read(cache_key)
      read_cache(cache_key)
    end
    
    # Write to cache
    # @param cache_key [String] Cache identifier
    # @param data [Object] Data to cache
    def write(cache_key, data)
      write_cache(cache_key, data)
    end
    
    private
    
    def read_cache(cache_key)
      cache_file = cache_path(cache_key)
      
      return nil unless File.exist?(cache_file)
      
      JSON.parse(File.read(cache_file))
    rescue JSON::ParserError => e
      puts "Warning: Failed to parse cache file #{cache_key}: #{e.message}" if ENV['DEBUG']
      File.delete(cache_file) if File.exist?(cache_file)
      nil
    end
    
    def write_cache(cache_key, data)
      FileUtils.mkdir_p(CACHE_DIR)
      cache_file = cache_path(cache_key)
      
      File.write(cache_file, JSON.pretty_generate(data))
    rescue => e
      puts "Warning: Failed to write cache file #{cache_key}: #{e.message}" if ENV['DEBUG']
    end
    
    def cache_path(cache_key)
      File.join(CACHE_DIR, "#{cache_key}.json")
    end
  end
  end
end
