require_relative 'seed_data_manager'
require_relative 'interactive_editor'

# Provides a cohesive interface for CRUD operations
# Handles both Xibo API updates and seed data synchronization
module CrudOperations
  include InteractiveEditor

  # Create an entity in Xibo and optionally in seed data
  # @param entity_type [Symbol] :board, :category, or :product
  # @param attributes [Hash] Entity attributes
  # @param options [Hash] Additional options (:parent_id, :update_seeds, :category_name)
  # @return [Hash] Created entity data from Xibo
  def create_entity(entity_type, attributes, options = {})
    config = entity_config(entity_type)

    # Create in Xibo
    print_info("Creating #{config[:display_name]}...")
    endpoint = build_endpoint(config[:create_endpoint], options)
    result = client.post(endpoint, body: attributes.transform_keys(&:to_sym))

    print_success("#{config[:display_name]} created successfully!")
    print_info("ID: #{result[config[:id_field]]}")

    # Update seed data if requested
    if options[:update_seeds]
      update_seed_after_create(entity_type, attributes, options)
    end

    result
  rescue => e
    print_error("Failed to create #{config[:display_name]}: #{e.message}")
    raise if debug?
  end

  # Delete an entity from Xibo and optionally from seed data
  # @param entity_type [Symbol] :board, :category, or :product
  # @param entity_id [Integer] ID of entity to delete
  # @param entity_name [String] Name of entity (for seed data lookup)
  # @param options [Hash] Additional options (:update_seeds, :category_name, :force)
  # @return [Boolean] true if deleted
  def delete_entity(entity_type, entity_id, entity_name, options = {})
    config = entity_config(entity_type)

    # Confirm deletion unless force flag is set
    unless options[:force]
      print "\nAre you sure you want to delete #{config[:display_name]} '#{entity_name}'? (y/n): "
      confirmation = STDIN.gets.chomp.downcase
      unless confirmation == 'y' || confirmation == 'yes'
        print_info("Deletion cancelled")
        return false
      end
    end

    # Delete from Xibo
    print_info("Deleting #{config[:display_name]}...")
    endpoint = build_endpoint(config[:delete_endpoint], { id: entity_id })
    client.delete(endpoint)

    print_success("#{config[:display_name]} deleted from Xibo")

    # Update seed data if requested
    if options[:update_seeds]
      delete_from_seed(entity_type, entity_name, options)
    end

    true
  rescue => e
    print_error("Failed to delete #{config[:display_name]}: #{e.message}")
    raise if debug?
    false
  end

  # Interactively create an entity by prompting for fields
  # @param entity_type [Symbol] :board, :category, or :product
  # @param options [Hash] Additional options (parent context, etc.)
  # @return [Hash] Created entity
  def interactive_create(entity_type, options = {})
    config = entity_config(entity_type)

    puts "\n--- Create #{config[:display_name]} ---"

    # Collect field values
    attributes = {}
    config[:fields].each do |field|
      value = prompt_field(
        field[:name],
        nil,
        type: field[:type],
        prompt: "#{field[:label]}: "
      )

      # Skip if empty and not required
      next if value.nil? && !field[:required]

      # Validate required fields
      if field[:required] && value.nil?
        print_error("#{field[:label]} is required")
        return nil
      end

      attributes[field[:name]] = value if value
    end

    # Show summary
    puts "\n#{config[:display_name]} to create:"
    attributes.each do |key, value|
      formatted_value = format_display_value(value)
      puts "  #{key}: #{formatted_value}"
    end

    print "\nCreate this #{config[:display_name]}? (y/n): "
    confirmation = STDIN.gets.chomp.downcase

    unless confirmation == 'y' || confirmation == 'yes'
      print_info("Creation cancelled")
      return nil
    end

    # Create the entity
    create_entity(entity_type, attributes, options.merge(update_seeds: true))
  end

  # Interactively select and delete an entity
  # @param entity_type [Symbol] :board, :category, or :product
  # @param entities [Array] List of entities to choose from
  # @param options [Hash] Additional options
  # @return [Boolean] true if deleted
  def interactive_delete(entity_type, entities, options = {})
    config = entity_config(entity_type)

    if entities.empty?
      print_error("No #{config[:plural_name]} found")
      return false
    end

    # Select entity
    selected = select_from_list(
      entities,
      title: "Select #{config[:display_name]} to delete",
      display_field: 'name',
      id_field: config[:id_field]
    )

    return false unless selected

    # Delete the entity
    delete_entity(
      entity_type,
      selected[config[:id_field]],
      selected['name'],
      options.merge(update_seeds: true)
    )
  end

  private

  # Configuration for each entity type
  def entity_config(entity_type)
    configs = {
      board: {
        display_name: 'Menu Board',
        plural_name: 'menu boards',
        id_field: 'menuId',
        create_endpoint: '/menuboard',
        delete_endpoint: '/menuboard/:id',
        seed_file: 'menu_boards.json',
        seed_key: 'boards',
        fields: [
          { name: 'name', label: 'Name', type: :string, required: true },
          { name: 'code', label: 'Code', type: :string, required: false },
          { name: 'description', label: 'Description', type: :string, required: false }
        ]
      },
      category: {
        display_name: 'Category',
        plural_name: 'categories',
        id_field: 'menuCategoryId',
        create_endpoint: '/menuboard/:parent_id/category',
        delete_endpoint: '/menuboard/:id/category',
        seed_file: 'categories.json',
        seed_key: 'categories',
        fields: [
          { name: 'name', label: 'Name', type: :string, required: true },
          { name: 'code', label: 'Code', type: :string, required: false },
          { name: 'description', label: 'Description', type: :string, required: false }
        ]
      },
      product: {
        display_name: 'Product',
        plural_name: 'products',
        id_field: 'menuProductId',
        create_endpoint: '/menuboard/:parent_id/product',
        delete_endpoint: '/menuboard/:id/product',
        seed_file: 'products.json',
        seed_key: 'products',
        fields: [
          { name: 'name', label: 'Name', type: :string, required: true },
          { name: 'description', label: 'Description', type: :string, required: false },
          { name: 'price', label: 'Price', type: :float, required: false },
          { name: 'calories', label: 'Calories', type: :integer, required: false },
          { name: 'allergyInfo', label: 'Allergy Info', type: :string, required: false },
          { name: 'code', label: 'Code', type: :string, required: false },
          { name: 'availability', label: 'Available? (y/n)', type: :boolean, required: false }
        ]
      }
    }

    configs[entity_type] || raise("Unknown entity type: #{entity_type}")
  end

  # Build endpoint URL by replacing placeholders
  def build_endpoint(template, options)
    endpoint = template.dup
    endpoint.gsub!(':parent_id', options[:parent_id].to_s) if options[:parent_id]
    endpoint.gsub!(':id', options[:id].to_s) if options[:id]
    endpoint
  end

  # Update seed data after creating an entity
  def update_seed_after_create(entity_type, attributes, options)
    seed_manager = SeedDataManager.new
    config = entity_config(entity_type)

    case entity_type
    when :board
      add_to_seed_array(config[:seed_file], config[:seed_key], attributes)
      print_success("Added to #{config[:seed_file]}")

    when :category
      add_to_seed_array(config[:seed_file], config[:seed_key], attributes)
      print_success("Added to #{config[:seed_file]}")

    when :product
      category_name = options[:category_name]
      unless category_name
        print_error("Category name required to update seed data")
        return
      end

      add_product_to_seed(category_name, attributes)
      print_success("Added to #{config[:seed_file]}")
    end
  end

  # Delete from seed data
  def delete_from_seed(entity_type, entity_name, options)
    seed_manager = SeedDataManager.new
    config = entity_config(entity_type)

    case entity_type
    when :board
      remove_from_seed_array(config[:seed_file], config[:seed_key], entity_name)
      print_success("Removed from #{config[:seed_file]}")

    when :category
      remove_from_seed_array(config[:seed_file], config[:seed_key], entity_name)
      print_success("Removed from #{config[:seed_file]}")

    when :product
      category_name = options[:category_name]
      unless category_name
        print_error("Category name required to update seed data")
        return
      end

      remove_product_from_seed(category_name, entity_name)
      print_success("Removed from #{config[:seed_file]}")
    end
  end

  # Add item to seed array
  def add_to_seed_array(filename, key, attributes)
    seed_manager = SeedDataManager.new
    data = seed_manager.read_seed_file(filename) || { key => [] }
    data[key] ||= []

    # Check if already exists
    existing = data[key].find { |item| item['name'] == attributes['name'] || item['name'] == attributes[:name] }
    if existing
      print_info("Item already exists in seed data, skipping")
      return
    end

    # Convert symbol keys to strings for consistency
    item = attributes.transform_keys(&:to_s)
    data[key] << item

    seed_manager.write_seed_file(filename, data)
  end

  # Remove item from seed array
  def remove_from_seed_array(filename, key, name)
    seed_manager = SeedDataManager.new
    data = seed_manager.read_seed_file(filename)
    return unless data && data[key]

    data[key].reject! { |item| item['name'] == name }
    seed_manager.write_seed_file(filename, data)
  end

  # Add product to seed (products are organized by category)
  def add_product_to_seed(category_name, attributes)
    seed_manager = SeedDataManager.new
    data = seed_manager.read_seed_file('products.json') || { 'products' => {} }
    data['products'] ||= {}
    data['products'][category_name] ||= []

    # Check if already exists
    existing = data['products'][category_name].find { |p| p['name'] == attributes['name'] || p['name'] == attributes[:name] }
    if existing
      print_info("Product already exists in seed data, skipping")
      return
    end

    # Convert symbol keys to strings
    item = attributes.transform_keys(&:to_s)
    data['products'][category_name] << item

    seed_manager.write_seed_file('products.json', data)
  end

  # Remove product from seed
  def remove_product_from_seed(category_name, product_name)
    seed_manager = SeedDataManager.new
    data = seed_manager.read_seed_file('products.json')
    return unless data && data['products'] && data['products'][category_name]

    data['products'][category_name].reject! { |p| p['name'] == product_name }
    seed_manager.write_seed_file('products.json', data)
  end

  # Get seed manager instance
  def seed_manager
    @seed_manager ||= SeedDataManager.new
  end
end
