#!/usr/bin/env ruby
require 'json'
require 'open3'

# Test the MCP server for menuboard operations
def test_mcp_menuboard
  mcp_script = File.join(__dir__, 'mcp_server.rb')
  
  puts "=== Testing MCP Server for Menuboard Operations ==="
  
  # Test 1: List tools
  puts "\n1. Listing available tools..."
  request = {"jsonrpc":"2.0","id":1,"method":"tools/list"}
  stdout, stderr, status = Open3.capture3("ruby #{mcp_script}", stdin_data: request.to_json + "\n")
  
  if status.success?
    response = JSON.parse(stdout)
    tools = response.dig('result', 'tools') || []
    menuboard_tools = tools.select { |t| t[:name].include?('menuboard') }
    puts "Available menuboard tools:"
    menuboard_tools.each { |t| puts "  - #{t[:name]}: #{t[:description]}" }
  else
    puts "Failed to list tools: #{stderr}"
    return
  end
  
  # Test 2: Parse update queue failures
  puts "\n2. Checking for failed menuboard updates..."
  request = {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"parse_update_queue_failures"}}
  stdout, stderr, status = Open3.capture3("ruby #{mcp_script}", stdin_data: request.to_json + "\n")
  
  if status.success?
    response = JSON.parse(stdout)
    content = response.dig('result', 'content') || []
    if content.any?
      puts content.first[:text]
    else
      puts "No content returned"
    end
  else
    puts "Failed to parse update queue failures: #{stderr}"
  end
  
  # Test 3: List menuboards
  puts "\n3. Listing current menuboards..."
  request = {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"menuboard_list","arguments"=>{}}}
  stdout, stderr, status = Open3.capture3("ruby #{mcp_script}", stdin_data: request.to_json + "\n")
  
  if status.success?
    response = JSON.parse(stdout)
    content = response.dig('result', 'content') || []
    if content.any?
      puts content.first[:text]
    else
      puts "No content returned"
    end
  else
    puts "Failed to list menuboards: #{stderr}"
  end
end

test_mcp_menuboard