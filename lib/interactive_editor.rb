# Helper module for interactive editing workflows
module InteractiveEditor
  # Prompt for a new value with option to keep current
  def prompt_field(field_name, current_value, options = {})
    display_value = format_display_value(current_value)
    prompt_text = options[:prompt] || "New #{field_name} (or press Enter to keep '#{display_value}'): "

    print prompt_text
    input = STDIN.gets.chomp

    return nil if input.empty?

    # Handle type conversion
    case options[:type]
    when :float
      input.to_f
    when :integer
      input.to_i
    when :boolean
      input.downcase == 'y' || input.downcase == 'yes' ? 1 : 0
    else
      input
    end
  end

  # Select an item from a list interactively
  def select_from_list(items, options = {})
    title = options[:title] || "Select an item"
    display_field = options[:display_field] || 'name'
    id_field = options[:id_field]
    allow_cancel = options[:allow_cancel] != false

    puts "\n--- #{title} ---"
    items.each_with_index do |item, idx|
      display = format_list_item(item, display_field, id_field)
      puts "#{idx + 1}. #{display}"
    end
    puts ""

    loop do
      cancel_text = allow_cancel ? " (or 0 to cancel)" : ""
      print "Select item number (1-#{items.length})#{cancel_text}: "
      choice = STDIN.gets.chomp.to_i

      return nil if allow_cancel && choice == 0
      return items[choice - 1] if choice > 0 && choice <= items.length

      puts "Invalid selection. Please try again."
    end
  end

  # Confirm changes before saving
  def confirm_changes(changes, old_values = {})
    puts "\nChanges to be saved:"
    changes.each do |key, value|
      old_value = format_display_value(old_values[key])
      new_value = format_display_value(value)
      puts "  #{key}: #{old_value} → #{new_value}"
    end

    print "\nSave these changes? (y/n): "
    confirmation = STDIN.gets.chomp.downcase
    confirmation == 'y' || confirmation == 'yes'
  end

  # Display a menu and get selection
  def show_menu(title, options)
    puts "\n" + "=" * 60
    puts title
    puts "=" * 60
    puts "\n#{options[:subtitle]}" if options[:subtitle]

    options[:items].each_with_index do |item, idx|
      puts "  #{idx + 1}. #{item}"
    end
    puts ""

    print "Select option (1-#{options[:items].length}): "
    STDIN.gets.chomp.to_i
  end

  # Collect field changes for an entity
  def collect_field_changes(entity, field_definitions)
    changes = {}

    field_definitions.each do |field|
      field_name = field[:name]
      current_value = entity[field_name]

      new_value = prompt_field(
        field_name,
        current_value,
        type: field[:type],
        prompt: field[:prompt]
      )

      changes[field_name] = new_value unless new_value.nil?
    end

    changes
  end

  private

  def format_display_value(value)
    return '(none)' if value.nil? || value == ''
    return "Yes" if value == 1 || value == true
    return "No" if value == 0 || value == false
    return "$#{value}" if value.is_a?(Float) || value.to_s.match?(/^\d+\.\d+$/)
    value.to_s
  end

  def format_list_item(item, display_field, id_field)
    display = item[display_field]

    if id_field && item[id_field]
      display += " (ID: #{item[id_field]})"
    end

    # Add additional context if available
    if item['code'] && display_field != 'code'
      display += " [#{item['code']}]"
    end

    if item['description'] && display_field != 'description'
      display += " - #{item['description']}"
    end

    if item['price']
      display += " - $#{item['price']}"
    end

    if item['availability'] == 0
      display += " [UNAVAILABLE]"
    end

    display
  end
end
