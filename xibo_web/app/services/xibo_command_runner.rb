require 'open3'
require 'json'
require 'shellwords'
require_relative '../../../lib/command_metadata'

class XiboCommandRunner
  XIBO_SCRIPT_PATH = File.expand_path('../../..', __dir__)
  XIBO_EXEC = File.join(XIBO_SCRIPT_PATH, 'xibo')

  def self.available_commands
    CommandMetadata.all_commands
  end

  def self.run(command, options = {})
    # Build command with options
    cmd_parts = [XIBO_EXEC, command]

    # Add options
    options.each do |key, value|
      next if value.nil? || (value.respond_to?(:empty?) && value.empty?)

      option_flag = "--#{key.to_s.gsub('_', '-')}"

      # Handle boolean flags
      if value == true || value == 'true'
        cmd_parts << option_flag
      elsif value == false || value == 'false'
        # Skip false boolean values
        next
      else
        cmd_parts << option_flag
        cmd_parts << value.to_s
      end
    end

    # Execute command
    stdout, stderr, status = Open3.capture3(*cmd_parts, chdir: XIBO_SCRIPT_PATH)

    {
      stdout: stdout,
      stderr: stderr,
      success: status.success?,
      exit_code: status.exitstatus
    }
  rescue => e
    {
      stdout: '',
      stderr: e.message,
      success: false,
      exit_code: 1
    }
  end
  
  def self.run_api_request(method:, path:, body: {})
    # Use the existing XiboClient from the CLI
    require_relative '../../../lib/xibo_client'
    
    # Save current directory and swagger.json path
    xibo_root = File.expand_path('../../..', __dir__)
    original_dir = Dir.pwd
    
    begin
      # Change to the CLI directory where swagger.json lives
      Dir.chdir(xibo_root)
      
      client = XiboClient.new
      client.authenticate!
      
      # Make the API request using the client
      result = client.request(path, method: method, body: body)
      
      {
        success: true,
        response: result
      }
    ensure
      # Always restore original directory
      Dir.chdir(original_dir) if original_dir
    end
  rescue => e
    {
      success: false,
      error: e.message
    }
  end
end
