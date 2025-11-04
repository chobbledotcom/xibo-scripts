require 'json'
require 'fileutils'

class XiboCacheService
  # Use shared cache directory from CLI app
  XIBO_ROOT = File.expand_path('../../..', __dir__)
  CACHE_DIR = File.join(XIBO_ROOT, 'tmp', 'cache')
  CACHE_DURATION = nil # Cache is always valid, updated by CLI commands
  
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
    
    def categories_for_menuboard(menu_id)
      cache_key = "categories_#{menu_id}"
      cached_data = read_cache(cache_key)
      
      if cached_data
        cached_data
      else
        fetch_and_cache_categories(menu_id)
      end
    rescue => e
      Rails.logger.error("Failed to fetch categories for menuboard #{menu_id}: #{e.message}")
      []
    end
    
    def products_for_category(category_id)
      cache_key = "products_#{category_id}"
      cached_data = read_cache(cache_key)
      
      if cached_data
        cached_data
      else
        fetch_and_cache_products(category_id)
      end
    rescue => e
      Rails.logger.error("Failed to fetch products for category #{category_id}: #{e.message}")
      []
    end
    
    def all_categories
      # Get all menuboards first
      boards = menuboards
      
      # Fetch categories for each menuboard
      all_cats = {}
      boards.each do |board|
        menu_id = board['menuId']
        all_cats[menu_id] = categories_for_menuboard(menu_id)
      end
      
      all_cats
    rescue => e
      Rails.logger.error("Failed to fetch all categories: #{e.message}")
      {}
    end
    
    def tree_data
      # Build complete tree: menuboards > categories > products
      boards = menuboards.sort_by { |b| b['name']&.downcase || '' }
      
      boards.map do |board|
        menu_id = board['menuId']
        categories = categories_for_menuboard(menu_id).sort_by { |c| c['name']&.downcase || '' }
        
        board_with_tree = board.dup
        board_with_tree['categories'] = categories.map do |category|
          category_id = category['menuCategoryId']
          products = products_for_category(category_id).sort_by { |p| p['name']&.downcase || '' }
          
          category_with_products = category.dup
          category_with_products['products'] = products
          category_with_products
        end
        
        board_with_tree
      end
    rescue => e
      Rails.logger.error("Failed to build tree data: #{e.message}")
      []
    end
    
    def refresh_menuboards
      fetch_and_cache_menuboards
    rescue => e
      Rails.logger.error("Failed to refresh menuboards: #{e.message}")
      []
    end
    
    def refresh_all
      # Refresh menuboards
      boards = refresh_menuboards
      
      # Refresh categories for each menuboard
      boards.each do |board|
        menu_id = board['menuId']
        fetch_and_cache_categories(menu_id)
      end
      
      boards
    rescue => e
      Rails.logger.error("Failed to refresh all data: #{e.message}")
      []
    end
    
    def invalidate_all
      FileUtils.rm_rf(CACHE_DIR) if Dir.exist?(CACHE_DIR)
      FileUtils.mkdir_p(CACHE_DIR)
    end
    
    def refresh_products(category_id)
      fetch_and_cache_products(category_id)
    rescue => e
      Rails.logger.error("Failed to refresh products for category #{category_id}: #{e.message}")
      []
    end
    
    def update_product_in_cache(category_id, product_id, updates)
      cache_key = "products_#{category_id}"
      products = read_cache(cache_key) || []
      
      Rails.logger.debug "Updating product #{product_id} in cache #{cache_key}"
      Rails.logger.debug "Updates: #{updates.inspect}"
      
      # Find and update the product
      product = products.find { |p| p['menuProductId'].to_s == product_id.to_s }
      if product
        Rails.logger.debug "Found product, current availability: #{product['availability']}"
        updates.each do |key, value|
          product[key.to_s] = value
        end
        Rails.logger.debug "After update, availability: #{product['availability']}"
        write_cache(cache_key, products)
      else
        Rails.logger.error "Product #{product_id} not found in cache!"
      end
      
      products
    rescue => e
      Rails.logger.error("Failed to update product in cache: #{e.message}")
      []
    end
    
    private
    
    def fetch_and_cache_menuboards
      result = XiboCommandRunner.run('menuboard:list', { json: true })
      
      if result[:success] && result[:stdout].present?
        begin
          menuboards = JSON.parse(result[:stdout])
          write_cache('menuboards', menuboards)
          
          # Also fetch and cache categories for each menuboard
          menuboards.each do |board|
            fetch_and_cache_categories(board['menuId'])
          end
          
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
    
    def fetch_and_cache_categories(menu_id)
      result = XiboCommandRunner.run('category:list', { menu_id: menu_id, json: true })
      
      if result[:success] && result[:stdout].present?
        begin
          categories = JSON.parse(result[:stdout])
          write_cache("categories_#{menu_id}", categories)
          
          # Also fetch and cache products for each category
          categories.each do |category|
            fetch_and_cache_products(category['menuCategoryId'])
          end
          
          categories
        rescue JSON::ParserError => e
          Rails.logger.error("Failed to parse categories JSON for menuboard #{menu_id}: #{e.message}")
          Rails.logger.error("Raw output: #{result[:stdout].inspect}")
          []
        end
      else
        # Empty result is OK for categories - some menuboards may have none
        write_cache("categories_#{menu_id}", [])
        []
      end
    end
    
    def fetch_and_cache_products(category_id)
      result = XiboCommandRunner.run('product:list', { category_id: category_id, json: true })
      
      if result[:success] && result[:stdout].present?
        begin
          products = JSON.parse(result[:stdout])
          write_cache("products_#{category_id}", products)
          products
        rescue JSON::ParserError => e
          Rails.logger.error("Failed to parse products JSON for category #{category_id}: #{e.message}")
          Rails.logger.error("Raw output: #{result[:stdout].inspect}")
          []
        end
      else
        # Empty result is OK for products - some categories may have none
        write_cache("products_#{category_id}", [])
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
      File.join(CACHE_DIR, "#{cache_key}.json")
    end
  end
end
