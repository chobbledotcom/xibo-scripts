module CommandRegistry
  # Auto-discover all command files
  def self.discover_commands
    commands = {}

    # Find all command files in the commands2 directory, excluding base_command
    Dir.glob(File.join(__dir__, 'commands2', '**', '*_command.rb')).each do |file|
      # Skip base_command.rb
      next if File.basename(file) == 'base_command.rb'
      # Load the file
      require file

      # Extract category and action from path
      # e.g., commands/media/list_command.rb -> media, list
      path_parts = file.split('/')
      category = path_parts[-2].to_sym

      # Convert filename to action name
      # list_command.rb -> list
      # upload_image_command.rb -> upload-image
      action_name = File.basename(file, '_command.rb')
      action = action_name.gsub('_', '-').to_sym

      # Build the class name
      # media/list_command.rb -> Commands::Media::ListCommand
      category_module = category.to_s.split('_').map(&:capitalize).join
      action_class = action_name.split('_').map(&:capitalize).join + 'Command'

      begin
        # Get the actual class constant
        klass = Commands.const_get(category_module).const_get(action_class)

        # Add to commands hash
        commands[category] ||= {}
        commands[category][action] = klass
      rescue NameError => e
        # Skip if class doesn't exist or doesn't follow convention
        puts "Warning: Could not load #{category_module}::#{action_class} from #{file}" if ENV['DEBUG']
      end
    end

    commands
  end

  # Lazy load commands on first access
  def self.commands
    @commands ||= discover_commands
  end

  COMMANDS = commands.freeze

  def self.get_command(category, action)
    COMMANDS.dig(category, action)
  end

  def self.available_commands
    commands = []
    COMMANDS.each do |category, actions|
      actions.keys.each do |action|
        commands << "#{category}:#{action}"
      end
    end
    commands
  end

  def self.command_description(category, action)
    command_class = get_command(category, action)
    return nil unless command_class

    # Check if the command class has a description method
    if command_class.respond_to?(:description)
      command_class.description
    else
      # Fallback to generating description from class name
      "Execute #{action.to_s.gsub('-', ' ')} for #{category}"
    end
  end

  def self.categories
    COMMANDS.keys.sort
  end

  def self.actions_for_category(category)
    COMMANDS[category]&.keys&.sort || []
  end
end