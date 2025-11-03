#!/usr/bin/env ruby
# Quick test script for the MCP server

require 'json'
require 'open3'

# Test the MCP server
def test_mcp
  mcp_script = File.join(__dir__, 'mcp_server.rb')
  
  # Test 1: Initialize
  puts "=== Test 1: Initialize ==="
  request = {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
  stdout, stderr, status = Open3.capture3("ruby #{mcp_script}", stdin_data: request.to_json + "\n")
  puts "STDOUT: #{stdout}"
  puts "STDERR: #{stderr}"
  puts "Status: #{status.success?}"
  puts
  
  # Test 2: List tools
  puts "=== Test 2: List Tools ==="
  request = {"jsonrpc":"2.0","id":2,"method":"tools/list"}
  stdout, stderr, status = Open3.capture3("ruby #{mcp_script}", stdin_data: request.to_json + "\n")
  puts "STDOUT: #{stdout}"
  puts "STDERR: #{stderr}"
  puts "Status: #{status.success?}"
  puts
  
  # Test 3: Call menuboard:list
  puts "=== Test 3: Call menuboard:list ==="
  request = {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"menuboard_list","arguments":{}}}
  stdout, stderr, status = Open3.capture3("ruby #{mcp_script}", stdin_data: request.to_json + "\n")
  puts "STDOUT: #{stdout}"
  puts "STDERR: #{stderr}"
  puts "Status: #{status.success?}"
end

test_mcp
