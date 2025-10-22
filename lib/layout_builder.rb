class LayoutBuilder
  # 1080p Portrait constants
  SCREEN_WIDTH = 1080
  SCREEN_HEIGHT = 1920

  # Header dimensions
  HEADER_WIDTH = 950
  HEADER_HEIGHT = 250
  HEADER_X = (SCREEN_WIDTH - HEADER_WIDTH) / 2  # Center horizontally
  HEADER_Y = 0

  # Grid calculations
  GRID_START_Y = HEADER_HEIGHT
  GRID_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT  # 1670px
  GRID_COLS = 3
  GRID_ROWS = 4

  # Box dimensions (calculated so margins = box_width/2)
  # 7 margins + 3 boxes = 1080, where margin = box_width/2
  BOX_WIDTH = SCREEN_WIDTH / 6.5  # ~166px
  BOX_MARGIN = BOX_WIDTH / 2      # ~83px
  BOX_HEIGHT = (GRID_HEIGHT - (GRID_ROWS + 1) * BOX_MARGIN) / GRID_ROWS  # ~313px

  def initialize(client)
    @client = client
  end

  def create_menu_layout(category_name, menu_board_id, products = [])
    puts "🏗️  Creating layout for '#{category_name}'"

    # Ensure we have a 1080p portrait resolution
    resolution = get_or_create_resolution

    # Create the layout
    layout = create_layout(category_name, resolution['resolutionId'])

    # Create header region
    header_region = create_header_region(layout['layoutId'], category_name)

    # Create product grid regions
    product_regions = create_product_grid(layout['layoutId'], products.first(12))

    # Publish the layout
    publish_layout(layout['layoutId'])

    puts "✅ Layout '#{category_name}' created successfully (ID: #{layout['layoutId']})"

    {
      layout: layout,
      header_region: header_region,
      product_regions: product_regions
    }
  end

  private

  def get_or_create_resolution
    # Check if 1080p portrait resolution exists
    resolutions = @client.request('/resolution')
    existing = resolutions.find { |r| r['width'] == SCREEN_WIDTH && r['height'] == SCREEN_HEIGHT }

    if existing
      puts "  Using existing resolution: #{existing['resolution']}"
      existing
    else
      puts "  Creating 1080p portrait resolution"
      @client.request('/resolution', body: {
        resolution: '1080p Portrait',
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT
      })
    end
  end

  def create_layout(name, resolution_id)
    puts "  Creating layout: #{name}"
    timestamp = Time.now.strftime("%m%d_%H%M")
    @client.request('/layout', body: {
      'name' => "Menu - #{name}",
      'description' => "Auto-generated menu layout for #{name} products",
      'resolutionId' => resolution_id,
      'code' => "MENU_#{name.upcase.gsub(' ', '_')}_#{timestamp}",
      'returnDraft' => true
    })
  end

  def create_header_region(layout_id, category_name)
    puts "  Creating header region"

    # Create a new playlist region for the header
    region = @client.request("/region/#{layout_id}", body: {
      'type' => 'playlist',
      'width' => HEADER_WIDTH.to_i,
      'height' => HEADER_HEIGHT.to_i,
      'top' => HEADER_Y.to_i,
      'left' => HEADER_X.to_i
    })

    puts "    Header region created (ID: #{region['regionId']})"
    puts "    Region response: #{region.inspect}" if ENV['DEBUG']

    # Extract playlist ID from region creation response
    playlist_id = region.dig('regionPlaylist', 'playlistId')

    if playlist_id
      # Add text widget directly to the region's playlist
      add_text_widget_to_playlist_id(playlist_id, category_name)
    else
      puts "    Warning: Could not find playlist for region"
    end

    region
  end

  def create_product_grid(layout_id, products)
    puts "  Creating product grid (#{products.length} products)"

    regions = []

    # Create up to 12 product regions
    12.times do |index|
      row = index / GRID_COLS
      col = index % GRID_COLS

      # Calculate position
      x = BOX_MARGIN + col * (BOX_WIDTH + BOX_MARGIN)
      y = GRID_START_Y + BOX_MARGIN + row * (BOX_HEIGHT + BOX_MARGIN)

      product = products[index] if index < products.length

      if product
        puts "    Product #{index + 1}: #{product['name']} at (#{x.to_i}, #{y.to_i})"
      else
        puts "    Empty slot #{index + 1} at (#{x.to_i}, #{y.to_i})"
      end

      # Create region for this product slot
      region = create_product_region(layout_id, x, y, product, index)
      regions << region
    end

    regions
  end

  def create_product_region(layout_id, x, y, product, index)
    # Create actual region via API
    region = @client.request("/region/#{layout_id}", body: {
      'type' => 'playlist',
      'width' => BOX_WIDTH.to_i,
      'height' => BOX_HEIGHT.to_i,
      'top' => y.to_i,
      'left' => x.to_i
    })

    puts "      Region created (ID: #{region['regionId']})"
    puts "      Region response: #{region.inspect}" if ENV['DEBUG']

    # Extract playlist ID from region creation response
    playlist_id = region.dig('regionPlaylist', 'playlistId')

    if playlist_id && product
      # Add product widget directly to the region's playlist
      add_product_widget_to_playlist_id(playlist_id, product)
    elsif product && !playlist_id
      puts "      Warning: Could not find playlist for product region"
    end

    region
  end

  def position_region(region_id, x, y, width, height)
    # Update region position and size
    # Note: This endpoint might need adjustment based on actual Xibo API
    puts "    Positioning region #{region_id} at (#{x.to_i}, #{y.to_i}) #{width.to_i}x#{height.to_i}"

    begin
      @client.request("/region/#{region_id}", body: {
        top: y.to_i,
        left: x.to_i,
        width: width.to_i,
        height: height.to_i
      })
    rescue => e
      puts "    Warning: Could not position region: #{e.message}"
    end
  end


  def add_text_widget_to_playlist_id(playlist_id, text)
    puts "    Adding text widget: '#{text}' to playlist #{playlist_id}"

    begin
      # Add text widget to playlist
      @client.request("/playlist/widget/text/#{playlist_id}", body: {
        'text' => text,
        'duration' => 10,
        'fontSize' => 48,
        'fontFamily' => 'Arial',
        'fontColor' => '#000000',
        'backgroundColor' => '#FFFFFF'
      })

      puts "      Text widget added to playlist #{playlist_id}"
    rescue => e
      puts "    Warning: Could not add text widget: #{e.message}"
    end
  end

  def add_product_widget_to_playlist_id(playlist_id, product)
    puts "      Adding product widget for '#{product['name']}' to playlist #{playlist_id}"

    begin
      # Add menu board widget to playlist
      @client.request("/playlist/widget/menuboard/#{playlist_id}", body: {
        'duration' => 30,
        'menuId' => product['menuId'] || 1,  # Will need to be passed properly
        'productId' => product['menuProductId']
      })

      puts "        Product widget added to playlist #{playlist_id}"
    rescue => e
      puts "      Warning: Could not add product widget: #{e.message}"
    end
  end


  def publish_layout(layout_id)
    puts "  Publishing layout"

    begin
      @client.request("/layout/publish/#{layout_id}")
    rescue => e
      puts "  Warning: Could not publish layout: #{e.message}"
    end
  end

  # Utility method to show grid visualization
  def self.show_grid_layout
    puts "\n📐 Layout Grid Visualization (1080x1920 portrait)"
    puts "=" * 60
    puts "Header: #{HEADER_X}, #{HEADER_Y}, #{HEADER_WIDTH}x#{HEADER_HEIGHT}"
    puts "Grid area: 0, #{GRID_START_Y}, #{SCREEN_WIDTH}x#{GRID_HEIGHT}"
    puts "Box size: #{BOX_WIDTH.to_i}x#{BOX_HEIGHT.to_i}, Margin: #{BOX_MARGIN.to_i}"
    puts "\nProduct positions:"

    12.times do |index|
      row = index / GRID_COLS
      col = index % GRID_COLS
      x = BOX_MARGIN + col * (BOX_WIDTH + BOX_MARGIN)
      y = GRID_START_Y + BOX_MARGIN + row * (BOX_HEIGHT + BOX_MARGIN)
      puts "  Product #{index + 1}: (#{x.to_i}, #{y.to_i}) #{BOX_WIDTH.to_i}x#{BOX_HEIGHT.to_i}"
    end
  end
end