# Unified parameter parser for all interfaces (CLI, MCP, Web)
# Ensures consistent parameter handling across the application
class ParameterParser
  # Parameter definitions with metadata for validation and transformation
  PARAMETER_DEFINITIONS = {
    # Common parameters
    id: { cli_flag: '--id', api_name: 'id', type: :integer },
    name: { cli_flag: '--name', short: '-n', api_name: 'name', type: :string },
    code: { cli_flag: '--code', api_name: 'code', type: :string },
    description: { cli_flag: '--description', api_name: 'description', type: :string },
    
    # Menu board parameters
    menu_id: { cli_flag: '--menu-id', api_name: 'menuId', type: :integer },
    folder_id: { cli_flag: '--folder-id', api_name: 'folderId', type: :integer },
    
    # Category parameters
    category_id: { cli_flag: '--category-id', api_name: 'categoryId', type: :integer },
    category: { cli_flag: '--category', api_name: 'category', type: :string },
    
    # Product parameters
    price: { cli_flag: '--price', api_name: 'price', type: :float },
    calories: { cli_flag: '--calories', api_name: 'calories', type: :integer },
    allergy_info: { cli_flag: '--allergy-info', api_name: 'allergyInfo', type: :string },
    available: { cli_flag: '--[no-]available', api_name: 'availability', type: :boolean_int, default: 1 },
    display_order: { cli_flag: '--display-order', api_name: 'displayOrder', type: :integer, default: 1 },
    
    # Media parameters
    file: { cli_flag: '--file', short: '-f', api_name: 'file', type: :string },
    url: { cli_flag: '--url', api_name: 'url', type: :string },
    random: { cli_flag: '--random', api_name: 'random', type: :boolean },
    size: { cli_flag: '--size', api_name: 'size', type: :integer, default: 800 },
    
    # General flags
    json: { cli_flag: '--json', api_name: 'json', type: :boolean },
    force: { cli_flag: '--force', api_name: 'force', type: :boolean },
    verbose: { cli_flag: '--verbose', short: '-v', api_name: 'verbose', type: :boolean },
    debug: { cli_flag: '--debug', short: '-d', api_name: 'debug', type: :boolean },
    show_grid: { cli_flag: '--show-grid', api_name: 'showGrid', type: :boolean }
  }

  # Parse parameters from any source and convert to API format
  # @param params [Hash] Parameters with symbol or string keys
  # @param format [Symbol] Output format - :api (string keys, API names), :internal (symbol keys, internal names), :cli (CLI flags)
  # @param apply_defaults [Boolean] Whether to apply default values for missing params
  # @return [Hash] Normalized parameters
  def self.parse(params, format: :api, apply_defaults: false)
    normalized = {}
    
    # First pass: process provided parameters
    params.each do |key, value|
      # Normalize key to symbol
      key_sym = key.to_sym
      
      # Skip if not defined
      definition = PARAMETER_DEFINITIONS[key_sym]
      next unless definition
      
      # Skip nil or empty values
      next if value.nil?
      next if value.respond_to?(:empty?) && value.empty?
      
      # Convert type
      converted_value = convert_type(value, definition[:type])
      
      # Use appropriate key based on format
      output_key = case format
      when :api
        definition[:api_name]
      when :internal
        key_sym
      when :cli
        definition[:cli_flag]
      else
        raise "Unknown format: #{format}"
      end
      
      normalized[output_key] = converted_value
    end
    
    # Second pass: apply defaults if requested
    if apply_defaults
      PARAMETER_DEFINITIONS.each do |key_sym, definition|
        next unless definition[:default]
        
        output_key = case format
        when :api
          definition[:api_name]
        when :internal
          key_sym
        when :cli
          definition[:cli_flag]
        else
          raise "Unknown format: #{format}"
        end
        
        # Only set default if not already set
        normalized[output_key] ||= definition[:default]
      end
    end
    
    normalized
  end
  
  # Convert parameters from API format back to internal format
  # Useful for parsing responses
  # @param params [Hash] Parameters with API names (string keys)
  # @return [Hash] Parameters with internal names (symbol keys)
  def self.from_api(params)
    normalized = {}
    
    params.each do |key, value|
      # Find the definition with matching api_name
      definition = PARAMETER_DEFINITIONS.find { |_, defn| defn[:api_name] == key.to_s }
      
      if definition
        internal_key, param_def = definition
        normalized[internal_key] = convert_type(value, param_def[:type])
      else
        # Keep unknown parameters as-is with symbol keys
        normalized[key.to_sym] = value
      end
    end
    
    normalized
  end
  
  # Build CLI arguments array from parameters
  # @param params [Hash] Parameters
  # @return [Array] CLI arguments
  def self.to_cli_args(params)
    args = []
    
    params.each do |key, value|
      key_sym = key.to_sym
      definition = PARAMETER_DEFINITIONS[key_sym]
      next unless definition
      
      flag = definition[:cli_flag]
      
      # Handle boolean flags
      if definition[:type] == :boolean
        if value == true || value == 'true'
          # For --[no-]available style flags, use the positive form
          args << flag.gsub('[no-]', '')
        elsif value == false || value == 'false'
          # For --[no-]available style flags, use the negative form
          if flag.include?('[no-]')
            args << flag.gsub('[no-]', 'no-')
          end
        end
      else
        args << flag
        args << value.to_s
      end
    end
    
    args
  end
  
  # Get all parameter definitions for a specific command
  # This can be used for validation or generating help text
  # @param command_name [String] Command name (e.g., 'menuboard:create')
  # @return [Hash] Relevant parameter definitions
  def self.parameters_for_command(command_name)
    # This could be extended to filter based on command
    # For now, return all definitions
    PARAMETER_DEFINITIONS
  end
  
  private
  
  # Convert value to the specified type
  # @param value [Object] Value to convert
  # @param type [Symbol] Target type
  # @return [Object] Converted value
  def self.convert_type(value, type)
    case type
    when :integer
      value.to_i
    when :float
      value.to_f
    when :boolean
      # Handle various boolean representations
      if value.is_a?(String)
        value.downcase == 'true' || value == '1'
      else
        !!value
      end
    when :boolean_int
      # Boolean converted to integer (0 or 1) for API compatibility
      if value.is_a?(String)
        (value.downcase == 'true' || value == '1') ? 1 : 0
      else
        value ? 1 : 0
      end
    when :string
      value.to_s
    else
      value
    end
  end
end
