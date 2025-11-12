#!/usr/bin/env ruby
# Test script to verify both CLI and Rails can load shared libraries

require 'colorize'

puts "=" * 60
puts "Testing Restructured Xibo Project".bold.green
puts "=" * 60
puts

# Test 1: Shared library loading
puts "Test 1: Loading shared Xibo module...".yellow
begin
  require_relative 'lib/xibo'
  puts "✓ Shared library loaded successfully".green
rescue LoadError => e
  puts "✗ Failed to load shared library: #{e.message}".red
  exit 1
end

# Test 2: Core classes available
puts "\nTest 2: Checking core classes...".yellow
begin
  # Check if main classes are defined
  raise "Xibo module not defined" unless defined?(Xibo)
  raise "Xibo::Client not defined" unless defined?(Xibo::Client)
  puts "✓ Core classes available".green
rescue => e
  puts "✗ Core classes check failed: #{e.message}".red
  exit 1
end

# Test 3: CLI can use shared libraries
puts "\nTest 3: Testing CLI compatibility...".yellow
begin
  # Simulate CLI loading
  $LOAD_PATH.unshift File.expand_path('cli', __dir__)
  require_relative 'cli/command_registry'
  puts "✓ CLI can load shared libraries".green
rescue LoadError => e
  puts "✗ CLI failed: #{e.message}".red
  exit 1
end

# Test 4: Rails can use shared libraries
puts "\nTest 4: Testing Rails compatibility...".yellow
begin
  # Simulate Rails loading from xibo_web/app/services/
  rails_lib_path = File.expand_path('lib', __dir__)
  unless $LOAD_PATH.include?(rails_lib_path)
    $LOAD_PATH.unshift rails_lib_path
  end
  
  # Try to load as Rails would
  require 'xibo'
  
  # Verify client can be instantiated
  client = Xibo::Client.new
  puts "✓ Rails can load shared libraries".green
rescue => e
  puts "✗ Rails compatibility failed: #{e.message}".red
  puts "  #{e.backtrace.first}".red if e.backtrace
  exit 1
end

# Test 5: Environment variables work
puts "\nTest 5: Checking environment configuration...".yellow
begin
  require 'dotenv'
  
  # Check if .env exists
  if File.exist?('.env')
    Dotenv.load
    puts "✓ Environment configuration loaded".green
  else
    puts "⚠ No .env file found (optional)".yellow
  end
rescue LoadError
  puts "⚠ dotenv not available (optional)".yellow
end

puts
puts "=" * 60
puts "All Tests Passed! ✓".bold.green
puts "=" * 60
puts
puts "Next steps:".yellow
puts "  1. CLI should work: ./xibo --help"
puts "  2. Rails should work: cd xibo_web && bin/rails server"
puts
