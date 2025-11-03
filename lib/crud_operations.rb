require_relative 'interactive_editor'
require_relative 'parameter_parser'
require_relative 'cache_service'

# Provides a cohesive interface for CRUD operations
# Handles Xibo API updates and cache invalidation
module CrudOperations
  include InteractiveEditor

  # Create an entity in Xibo
  # @param entity_type [Symbol] :board, :category, or :product
  # @param attributes [Hash] Entity attributes
  # @param options [Hash] Additional options (:parent_id, :category_name)
  # @return [Hash] Created entity data from Xibo
  def create_entity(entity_type, attributes, options = {})
    config = entity_config(entity_type)

    # Create in Xibo
    print_info("Creating #{config[:display_name]}...")
    endpoint = build_endpoint(config[:create_endpoint], options)
    # Parse attributes to API format (string keys with API names)
    api_params = ParameterParser.parse(attributes, format: :api, apply_defaults: true)
    result = client.request(endpoint, body: api_params)

    print_success("#{config[:display_name]} created successfully!")
    print_info("ID: #{result[config[:id_field]]}")

    # Invalidate relevant caches
    invalidate_cache_for(entity_type, options)

    result
  rescue => e
    print_error("Failed to create #{config[:display_name]}: #{e.message}")
    raise if debug?
  end

  # Delete an entity from Xibo
  # @param entity_type [Symbol] :board, :category, or :product
  # @param entity_id [Integer] ID of entity to delete
  # @param entity_name [String] Name of entity (for display)
  # @param options [Hash] Additional options (:category_name, :force)
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
    client.request(endpoint)

    print_success("#{config[:display_name]} deleted from Xibo")

    # Invalidate relevant caches
    invalidate_cache_for(entity_type, options)

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
    create_entity(entity_type, attributes, options)
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
      options
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
        cache_key: 'menuboards',
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
        cache_key: 'categories',
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
        cache_key: 'products',
        fields: [
          { name: 'name', label: 'Name', type: :string, required: true },
          { name: 'description', label: 'Description', type: :string, required: false },
          { name: 'price', label: 'Price', type: :float, required: false },
          { name: 'calories', label: 'Calories', type: :integer, required: false },
          { name: 'allergy_info', label: 'Allergy Info', type: :string, required: false },
          { name: 'code', label: 'Code', type: :string, required: false },
          { name: 'available', label: 'Available? (y/n)', type: :boolean, required: false },
          { name: 'display_order', label: 'Display Order', type: :integer, required: false }
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

  # Invalidate cache after entity changes
  def invalidate_cache_for(entity_type, options = {})
    config = entity_config(entity_type)
    
    # Invalidate the specific entity cache
    CacheService.invalidate(config[:cache_key])
    
    # For categories and products, also invalidate menuboards cache
    # since they affect the overall structure
    if entity_type == :category || entity_type == :product
      CacheService.invalidate('menuboards')
    end
    
    # Invalidate parent-specific caches if applicable
    if options[:parent_id]
      CacheService.invalidate("#{config[:cache_key]}_#{options[:parent_id]}")
    end
  end
end
