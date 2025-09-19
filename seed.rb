#!/usr/bin/env ruby

require 'dotenv'
require 'json'
require 'fileutils'
require_relative 'lib/xibo_client'
require_relative 'lib/image_manager'

Dotenv.load

class MenuSeeder
  def initialize
    @client = XiboClient.new
    @image_manager = ImageManager.new(@client)
    @seeds_dir = 'seeds'
  end

  def run(force = false)
    puts "\n🌱 Menu Board Seeder\n"
    puts "=" * 40

    if force
      if confirm_clean?
        puts "🔄 Force mode: Complete recreation"
        clean_existing_data
        populate_data
      else
        puts "\n❌ Seeding cancelled"
        return
      end
    else
      puts "🔄 Incremental mode: Update existing data"
      sync_data
    end

    puts "\n✅ Seeding complete!"
  end

  private

  def confirm_clean?
    print "\n⚠️  This will DELETE all existing menu boards, categories, products, and media. Continue? (y/N): "
    response = STDIN.gets.chomp.downcase
    response == 'y'
  end

  def clean_existing_data
    puts "\n🧹 Cleaning existing data..."

    # Delete all menu boards (cascades to categories and products)
    print "  Fetching existing menu boards..."
    boards = @client.get('/menuboards')
    puts " found #{boards.length}"

    boards.each do |board|
      print "  Deleting menu board '#{board['name']}' (ID: #{board['menuId']})..."
      @client.delete("/menuboard/#{board['menuId']}")
      puts " ✓"
    end

    # Delete all media files
    print "  Fetching existing media..."
    media = @client.get('/library')
    puts " found #{media.length}"

    media.each do |item|
      print "  Deleting media '#{item['name']}' (ID: #{item['mediaId']})..."
      begin
        @client.delete("/library/#{item['mediaId']}")
        puts " ✓"
      rescue => e
        puts " ✗ (#{e.message})"
      end
    end

    puts "✅ Clean complete"
  end

  def populate_data
    puts "\n📦 Populating new data..."

    # Load seed data
    boards_data = JSON.parse(File.read("#{@seeds_dir}/menu_boards.json"))
    categories_data = JSON.parse(File.read("#{@seeds_dir}/categories.json"))
    products_data = JSON.parse(File.read("#{@seeds_dir}/products.json"))

    # Create menu boards
    boards_data['boards'].each do |board_data|
      print "  Creating menu board '#{board_data['name']}'..."
      board = @client.post('/menuboard', body: board_data)
      puts " ✓ (ID: #{board['menuId']})"

      # Create categories for this board
      categories_data['categories'].each do |category_data|
        print "    Adding category '#{category_data['name']}'..."
        category = @client.post("/menuboard/#{board['menuId']}/category", body: category_data)
        puts " ✓ (ID: #{category['menuCategoryId']})"

        # Add products to this category
        if products_data['products'][category_data['name']]
          products_data['products'][category_data['name']].each do |product_data|
            add_product_with_image(category['menuCategoryId'], product_data)
          end
        end
      end
    end
  end

  def sync_data
    puts "\n📦 Syncing data..."

    # Load seed data
    boards_data = JSON.parse(File.read("#{@seeds_dir}/menu_boards.json"))
    categories_data = JSON.parse(File.read("#{@seeds_dir}/categories.json"))
    products_data = JSON.parse(File.read("#{@seeds_dir}/products.json"))

    # Get existing data
    existing_boards = @client.get('/menuboards')
    existing_media = @client.get('/library')

    # Sync menu boards
    boards_data['boards'].each do |board_data|
      board = sync_menu_board(existing_boards, board_data)

      # Sync categories for this board
      existing_categories = get_board_categories(board['menuId'])
      categories_data['categories'].each do |category_data|
        category = sync_category(board['menuId'], existing_categories, category_data)

        # Sync products for this category
        if products_data['products'][category_data['name']]
          existing_products = get_category_products(category['menuCategoryId'])
          products_data['products'][category_data['name']].each do |product_data|
            sync_product(category['menuCategoryId'], existing_products, existing_media, product_data)
          end

          # Remove products not in seed data
          cleanup_products(category['menuCategoryId'], existing_products, products_data['products'][category_data['name']])
        end
      end

      # Remove categories not in seed data
      cleanup_categories(board['menuId'], existing_categories, categories_data['categories'])
    end

    # Remove boards not in seed data
    cleanup_boards(existing_boards, boards_data['boards'])
  end

  def sync_menu_board(existing_boards, board_data)
    existing = existing_boards.find { |b| b['name'] == board_data['name'] }

    if existing
      # Update existing board if needed
      if needs_update?(existing, board_data, %w[description code])
        print "  Updating menu board '#{board_data['name']}'..."
        @client.post("/menuboard/#{existing['menuId']}", body: board_data)
        puts " ✓"
      else
        print "  Menu board '#{board_data['name']}' is up to date..."
        puts " ✓"
      end
      existing
    else
      # Create new board
      print "  Creating menu board '#{board_data['name']}'..."
      board = @client.post('/menuboard', body: board_data)
      puts " ✓ (ID: #{board['menuId']})"
      board
    end
  end

  def sync_category(menu_id, existing_categories, category_data)
    existing = existing_categories.find { |c| c['name'] == category_data['name'] }

    if existing
      # Update existing category if needed
      if needs_update?(existing, category_data, %w[description code])
        print "    Updating category '#{category_data['name']}'..."
        @client.post("/menuboard/#{existing['menuCategoryId']}/category", body: category_data)
        puts " ✓"
      else
        print "    Category '#{category_data['name']}' is up to date..."
        puts " ✓"
      end
      existing
    else
      # Create new category
      print "    Creating category '#{category_data['name']}'..."
      category = @client.post("/menuboard/#{menu_id}/category", body: category_data)
      puts " ✓ (ID: #{category['menuCategoryId']})"
      category
    end
  end

  def sync_product(category_id, existing_products, existing_media, product_data)
    existing = existing_products.find { |p| p['name'] == product_data['name'] }

    if existing
      # Update existing product if needed
      if needs_update?(existing, product_data, %w[description price calories allergyInfo code availability])
        print "      Updating product '#{product_data['name']}'..."

        # Handle media - only update if we need to create new image
        product_body = product_data.dup
        product_body['displayOrder'] = existing['displayOrder'] || 1

        # Keep existing media if it exists
        if existing['mediaId']
          product_body['mediaId'] = existing['mediaId']
        else
          # Create new image if none exists
          media_result = @image_manager.download_and_upload_random(product_data['name'])
          product_body['mediaId'] = media_result['mediaId']
        end

        @client.put("/menuboard/#{existing['menuProductId']}/product", body: product_body)
        puts " ✓"
      else
        print "      Product '#{product_data['name']}' is up to date..."
        puts " ✓"
      end
    else
      # Create new product with image
      add_product_with_image(category_id, product_data)
    end
  end

  def cleanup_boards(existing_boards, seed_boards)
    seed_names = seed_boards.map { |b| b['name'] }
    existing_boards.each do |board|
      unless seed_names.include?(board['name'])
        print "  Removing menu board '#{board['name']}'..."
        @client.delete("/menuboard/#{board['menuId']}")
        puts " ✓"
      end
    end
  end

  def cleanup_categories(menu_id, existing_categories, seed_categories)
    seed_names = seed_categories.map { |c| c['name'] }
    existing_categories.each do |category|
      unless seed_names.include?(category['name'])
        print "    Removing category '#{category['name']}'..."
        @client.delete("/menuboard/#{category['menuCategoryId']}/category")
        puts " ✓"
      end
    end
  end

  def cleanup_products(category_id, existing_products, seed_products)
    seed_names = seed_products.map { |p| p['name'] }
    existing_products.each do |product|
      unless seed_names.include?(product['name'])
        print "      Removing product '#{product['name']}'..."
        @client.delete("/menuboard/#{product['menuProductId']}/product")
        puts " ✓"
      end
    end
  end

  def get_board_categories(menu_id)
    @client.get("/menuboard/#{menu_id}/categories")
  rescue => e
    puts "Warning: Could not fetch categories for board #{menu_id}: #{e.message}"
    []
  end

  def get_category_products(category_id)
    @client.get("/menuboard/#{category_id}/products")
  rescue => e
    puts "Warning: Could not fetch products for category #{category_id}: #{e.message}"
    []
  end

  def needs_update?(existing, new_data, fields)
    fields.any? do |field|
      existing[field] != new_data[field]
    end
  end

  def add_product_with_image(category_id, product_data)
    print "      Adding product '#{product_data['name']}' with image..."

    # Check for existing media first
    existing_media = @image_manager.find_existing_media(product_data['name'])

    if existing_media
      media_id = existing_media['mediaId']
      puts " (reusing existing image #{media_id})"
    else
      # Download and upload new image
      media_result = @image_manager.download_and_upload_random(product_data['name'])
      media_id = media_result['mediaId']
      puts " (new image #{media_id})"
    end

    # Create product with media reference
    product_body = product_data.dup
    product_body['mediaId'] = media_id
    product_body['displayOrder'] = 1 # Default display order

    product = @client.post("/menuboard/#{category_id}/product", body: product_body)
    puts "      ✓ Product ID: #{product['menuProductId']}"

  rescue => e
    puts " ✗ Error: #{e.message}"
  end

end

# Run the seeder
if __FILE__ == $0
  force = ARGV.include?('--force') || ARGV.include?('-f')
  seeder = MenuSeeder.new
  seeder.run(force)
end