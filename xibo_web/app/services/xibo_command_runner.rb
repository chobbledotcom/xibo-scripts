require 'open3'
require_relative '../../../../lib/command_metadata'

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
end
