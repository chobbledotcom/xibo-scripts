#!/usr/bin/env ruby
# MCP Server for Xibo Commands
# This allows AI assistants to call the same Xibo commands that the web interface uses
#
# To use this, add to your MCP settings (e.g., ~/.config/opencode/mcp_settings.json):
# {
#   "mcpServers": {
#     "xibo": {
#       "command": "ruby",
#       "args": ["/home/user/git/xibo-scripts/mcp_server.rb"]
#     }
#   }
# }

require 'json'
require 'open3'
require_relative 'lib/command_metadata'

XIBO_EXEC = File.join(__dir__, 'xibo')

def list_tools
  tools = []
  
  CommandMetadata.all_commands.each do |category, commands|
    commands.each do |cmd|
      tool = {
        name: cmd[:name].gsub(':', '_'),
        description: "#{cmd[:description]} (Category: #{category})",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
      
      if cmd[:params] && !cmd[:params].empty?
        cmd[:params].each do |param|
          tool[:inputSchema][:properties][param] = {
            type: "string",
            description: "The #{param.to_s.gsub('_', ' ')}"
          }
        end
      end
      
      tools << tool
    end
  end
  
  tools
end

def run_xibo_command(command, options = {})
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
  stdout, stderr, status = Open3.capture3(*cmd_parts, chdir: __dir__)

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

def handle_request(request)
  method = request['method']
  
  case method
  when 'initialize'
    {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "xibo-mcp-server",
        version: "1.0.0"
      }
    }
    
  when 'tools/list'
    {
      tools: list_tools
    }
    
  when 'tools/call'
    tool_name = request.dig('params', 'name')
    arguments = request.dig('params', 'arguments') || {}
    
    # Convert tool name back to command format (e.g., menuboard_list -> menuboard:list)
    command = tool_name.gsub('_', ':')
    
    result = run_xibo_command(command, arguments)
    
    output_text = ""
    output_text += "Command: #{command}\n"
    output_text += "Exit Code: #{result[:exit_code]}\n"
    output_text += "Success: #{result[:success]}\n\n"
    
    if result[:stdout] && !result[:stdout].to_s.empty?
      output_text += "=== OUTPUT ===\n#{result[:stdout]}\n\n"
    end
    
    if result[:stderr] && !result[:stderr].to_s.empty?
      output_text += "=== ERRORS ===\n#{result[:stderr]}\n"
    end
    
    {
      content: [
        {
          type: "text",
          text: output_text
        }
      ],
      isError: !result[:success]
    }
    
  else
    {
      error: {
        code: -32601,
        message: "Method not found: #{method}"
      }
    }
  end
end

# Main loop - read JSON-RPC messages from stdin
STDOUT.sync = true
STDERR.puts "Xibo MCP Server starting..."
STDERR.puts "Available tools: #{list_tools.map { |t| t[:name] }.join(', ')}"

begin
  while line = STDIN.gets
    line = line.strip
    next if line.empty?
    
    begin
      request = JSON.parse(line)
      response = handle_request(request)
      
      output = {
        jsonrpc: "2.0",
        id: request['id']
      }
      
      if response[:error]
        output[:error] = response[:error]
      else
        output[:result] = response
      end
      
      puts JSON.generate(output)
    rescue JSON::ParserError => e
      STDERR.puts "Failed to parse JSON: #{e.message}"
      STDERR.puts "Line: #{line}"
    rescue => e
      STDERR.puts "Error handling request: #{e.message}"
      STDERR.puts e.backtrace.join("\n")
      
      puts JSON.generate({
        jsonrpc: "2.0",
        id: request&.[]('id'),
        error: {
          code: -32603,
          message: "Internal error: #{e.message}"
        }
      })
    end
  end
rescue Interrupt
  STDERR.puts "\nShutting down..."
end
